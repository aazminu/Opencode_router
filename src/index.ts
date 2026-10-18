import path from "node:path"
import { fileURLToPath } from "node:url"
import type { Plugin, PluginInput } from "@opencode-ai/plugin"
import { buildRoutingTable, pickForRole, type BuildResult } from "./engine.js"
import { LedgerStore } from "./ledger.js"
import { blendedCost } from "./scoring.js"
import { routingConfigBody, writeApplyMarker, clearApplyMarker } from "./apply.js"
import { globalStateDir, writeJson, ensureDir } from "./paths.js"
import type { RoleName } from "./types.js"

const AGENT_TO_ROLE: Record<string, RoleName> = {
  plan: "plan",
  build: "build",
  general: "general",
  explore: "explore",
}

const COMMAND_NAMES = new Set(["refresh-routing", "routing-status", "routing-plan", "routing-eval"])

function cliFilePath(): string {
  try {
    return fileURLToPath(new URL("./cli.js", import.meta.url)).replace(/\\/g, "/")
  } catch {
    return "opencode-router"
  }
}

function commandTemplate(args: string): string {
  const cli = cliFilePath()
  return [
    "opencode-router already ran. Its output is between the markers below.",
    "",
    "Rules:",
    "1. Do not run any command, script, or tool. Do not search for opencode-router on PATH.",
    "2. Present the text between the markers to the user exactly as written.",
    "3. Do not summarize, reformat, shorten, or reorganize it.",
    "",
    "---BEGIN ROUTER OUTPUT---",
    `!\`node "${cli}" ${args} --scope global\``,
    "---END ROUTER OUTPUT---",
  ].join("\n")
}

function isRateLimitError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false
  const rec = error as Record<string, unknown>
  const name = String(rec.name ?? "")
  const data = (rec.data ?? {}) as Record<string, unknown>
  const status = Number(data.statusCode ?? data.status ?? 0)
  const message = String(data.message ?? data.responseBody ?? "").toLowerCase()
  if (status === 429 || status === 402) return true
  if (/rate.?limit|quota|too many requests|insufficient|capacity/.test(message)) return true
  return /api/i.test(name) && status >= 400
}

export const OpencodeRouter: Plugin = async (input: PluginInput) => {
  const dir = input.directory ?? input.worktree ?? process.cwd()
  // Usage caps are per OpenCode account, not per project: keep the ledger
  // and the routing state in the global location so every tool reads the
  // same numbers.
  const stateDir = globalStateDir()
  const ledger = new LedgerStore(path.join(stateDir, "ledger.json"), () => Date.now())
  const recordedMessages = new Set<string>()

  let cached: BuildResult | null = null
  let cachedAt = 0
  /** Per-model blended USD cost per 1M tokens, for self-estimating spend. */
  let blendedById: Map<string, number> = new Map()
  // Short TTL: after /refresh-routing (or any change to the catalog or config),
  // the running session recomputes the table on its next message without a
  // restart. Do not depend on hooks that may not fire.
  const TTL_MS = 15_000

  async function ensure(force = false): Promise<BuildResult> {
    const now = Date.now()
    if (!force && cached && now - cachedAt < TTL_MS) return cached
    cached = await buildRoutingTable({ projectDir: dir })
    cachedAt = now
    blendedById = new Map(cached.catalog.map((m) => [m.id, blendedCost(m, cached!.cfg)]))
    try {
      ensureDir(stateDir)
      writeJson(path.join(stateDir, "routing-table.json"), cached.table)
    } catch {
      /* state is best-effort */
    }
    return cached
  }

  function persistTable(result: BuildResult): void {
    try {
      ensureDir(stateDir)
      writeJson(path.join(stateDir, "routing-table.json"), result.table)
    } catch {
      /* ignore */
    }
  }

  async function usageReport(result: BuildResult): Promise<Record<string, { pct: number; label: string }>> {
    const capFor = LedgerStore.capLookup(result.scoreTable, result.cfg.plan)
    const out: Record<string, { pct: number; label: string }> = {}
    for (const entry of Object.values(result.table.active).flat()) {
      const u = ledger.usage(entry.id, capFor(entry.id))
      out[entry.id] = { pct: u.pct5h * 100, label: `${(u.pct5h * 100).toFixed(0)}%` }
    }
    return out
  }

  async function hotApply(result: BuildResult): Promise<string> {
    try {
      await input.client.config.update({ body: routingConfigBody(result.table) as never })
      writeApplyMarker("hot-applied to the running session by the opencode-router plugin")
      return "hot-applied to the running session"
    } catch (error) {
      // Record failures too: the CLI reports this in the Applied line, so a
      // rejected config body is visible instead of silently swallowed.
      const detail = `hot-apply failed: ${error instanceof Error ? error.message : String(error)}`
      writeApplyMarker(detail)
      return detail
    }
  }

  return {
    config: async (cfg) => {
      try {
        const result = await ensure()
        const body = routingConfigBody(result.table)

        cfg.agent = { ...(cfg.agent ?? {}), ...(body.agent as Record<string, never>) }
        if (body.model) cfg.model = body.model
        if (body.small_model) cfg.small_model = body.small_model

        const smallModel = result.table.active.small_model?.[0]?.id ?? body.small_model
        const commands = { ...(cfg.command ?? {}) } as Record<string, { template: string; description?: string; agent?: string; model?: string }>
        commands["refresh-routing"] = {
          description: "Recompute and hot-apply OpenCode model routing ([go|go-plus|free])",
          agent: "build",
          model: smallModel,
          template: commandTemplate("refresh --plan=$1"),
        }
        commands["routing-status"] = {
          description: "Show the current routing table and live quota use",
          agent: "build",
          model: smallModel,
          template: commandTemplate("status"),
        }
        commands["routing-plan"] = {
          description: "Switch the routing plan profile (go | go-plus | free)",
          agent: "build",
          model: smallModel,
          template: commandTemplate("plan $1"),
        }
        commands["routing-eval"] = {
          description: "Run the router scoring stress test",
          agent: "build",
          model: smallModel,
          template: commandTemplate("eval"),
        }
        cfg.command = commands as never
      } catch {
        /* never break OpenCode startup */
      }
    },

    "command.execute.before": async (cmdInput, output) => {
      const name = cmdInput.command.replace(/^\//, "")
      if (!COMMAND_NAMES.has(name)) return
      try {
        if (name === "refresh-routing" || name === "routing-plan" || name === "routing-eval") {
          // Clear first so the CLI never reports a result from an earlier run.
          clearApplyMarker()
          const result = await ensure(true)
          persistTable(result)
          await hotApply(result)
        }
      } catch (error) {
        writeApplyMarker(`router command failed: ${error instanceof Error ? error.message : String(error)}`)
      }
      void output
    },

    "chat.message": async (msgInput, output) => {
      try {
        const agent = msgInput.agent ?? output.message.agent
        const role = AGENT_TO_ROLE[agent]
        if (!role) return
        const result = await ensure()
        const capFor = LedgerStore.capLookup(result.scoreTable, result.cfg.plan)
        const entry = pickForRole(result.table, role, (id) =>
          ledger.isHealthy(id, capFor(id), result.cfg.softThreshold),
        )
        if (!entry) return
        if (output.message.model?.providerID === entry.providerID && output.message.model?.modelID === entry.modelID) {
          return
        }
        output.message.model = { providerID: entry.providerID, modelID: entry.modelID }
      } catch {
        /* never break a message */
      }
    },

    event: async ({ event }) => {
      try {
        if (event.type === "message.updated") {
          const info = event.properties.info
          if (info.role !== "assistant") return
          if (!info.time.completed) return
          if (recordedMessages.has(info.id)) return
          recordedMessages.add(info.id)
          if (recordedMessages.size > 500) recordedMessages.clear()

          const id = `${info.providerID}/${info.modelID}`
          const tokens =
            (info.tokens?.input ?? 0) +
            (info.tokens?.output ?? 0) +
            (info.tokens?.cache?.read ?? 0) +
            (info.tokens?.cache?.write ?? 0)
          let cost = info.cost ?? 0
          // Subscription turns may report $0. Estimate from the catalog so the
          // rolling ledger stays meaningful and failover still triggers.
          if (cost === 0 && tokens > 0) {
            const blended = blendedById.get(id) ?? 0
            if (blended > 0) cost = (tokens / 1_000_000) * blended
          }
          ledger.record(id, cost, tokens)

          if (info.error) {
            if (isRateLimitError(info.error)) {
              ledger.cooldown(id, 60 * 60 * 1000, "rate limit / quota")
            } else if (String((info.error as { name?: string }).name ?? "").includes("ProviderAuthError")) {
              ledger.cooldown(id, 24 * 60 * 60 * 1000, "auth error")
            }
          }
        } else if (event.type === "session.error") {
          const error = event.properties.error
          if (isRateLimitError(error)) {
            const result = await ensure()
            const chain = Object.values(result.table.active).flat()
            for (const entry of chain) ledger.cooldown(entry.id, 60 * 60 * 1000, "session rate limit")
          }
        }
      } catch {
        /* ignore */
      }
    },
  }
}

export default OpencodeRouter
