import type { Plugin, PluginInput } from "@opencode-ai/plugin"
import { buildRoutingTable, healthCheck, pickForRole, type BuildResult } from "./engine.js"
import { LedgerStore } from "./ledger.js"
import { blendedCost } from "./scoring.js"
import { routingConfigBody } from "./apply.js"
import { SLASH_COMMANDS, commandTemplate, isRouterCommandPrompt } from "./commands.js"
import { writeJson } from "./paths.js"
import { clearApplyMarker, ledgerFile, routingTableFile, writeApplyMarker } from "./state.js"
import { isAgentRole, isPlan, type PlanProfile } from "./types.js"

const RATE_LIMIT_COOLDOWN_MS = 60 * 60 * 1000
const AUTH_COOLDOWN_MS = 24 * 60 * 60 * 1000
const MAX_TRACKED_MESSAGES = 500
// Short TTL: after /refresh-routing (or any change to the catalog or config),
// the running session recomputes the table on its next message without a
// restart. Do not depend on hooks that may not fire.
const TTL_MS = 15_000

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Quota and rate-limit errors only. A plain bad request must not bench a model. */
function isRateLimitError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false
  const rec = error as Record<string, unknown>
  const data = (rec.data ?? {}) as Record<string, unknown>
  const status = Number(data.statusCode ?? data.status ?? 0)
  const message = String(data.message ?? data.responseBody ?? "").toLowerCase()
  if (status === 429 || status === 402) return true
  return /rate.?limit|quota|too many requests|insufficient|capacity|overloaded/.test(message)
}

function isAuthError(error: unknown): boolean {
  return typeof error === "object" && error !== null && String((error as { name?: unknown }).name ?? "").includes("ProviderAuthError")
}

export const OpencodeRouter: Plugin = async (input: PluginInput) => {
  const dir = input.directory ?? input.worktree ?? process.cwd()
  const ledger = new LedgerStore(ledgerFile(), () => Date.now())
  const recordedMessages = new Set<string>()
  /** Last model used per session, so a session error cools down only that model. */
  const sessionModels = new Map<string, string>()

  let cached: BuildResult | null = null
  let cachedAt = 0
  /** Per-model blended USD cost per 1M tokens, for self-estimating spend. */
  let blendedById = new Map<string, number>()

  async function ensure(force = false, plan?: PlanProfile): Promise<BuildResult> {
    const now = Date.now()
    if (!force && cached && now - cachedAt < TTL_MS) return cached
    const result = await buildRoutingTable({ projectDir: dir, plan })
    cached = result
    cachedAt = now
    blendedById = new Map(result.catalog.map((m) => [m.id, blendedCost(m, result.cfg)]))
    try {
      writeJson(routingTableFile(), result.table)
    } catch {
      /* state is best-effort */
    }
    return result
  }

  async function applyToSession(result: BuildResult): Promise<void> {
    try {
      await input.client.config.update({ body: routingConfigBody(result.table) })
      writeApplyMarker({ ok: true, detail: "hot-applied to the running session by the opencode-router plugin" })
    } catch (error) {
      // Record failures too: the CLI reports this in the Applied line, so a
      // rejected config body is visible instead of silently swallowed.
      writeApplyMarker({ ok: false, detail: `hot-apply failed: ${errorMessage(error)}` })
    }
  }

  function rememberMessage(id: string): void {
    recordedMessages.add(id)
    if (recordedMessages.size > MAX_TRACKED_MESSAGES) {
      const oldest = recordedMessages.values().next().value
      if (oldest !== undefined) recordedMessages.delete(oldest)
    }
  }

  return {
    config: async (cfg) => {
      try {
        const result = await ensure()
        const body = routingConfigBody(result.table)

        // Change only the model keys of each agent; keep its prompt, tools, and permissions.
        const agents = { ...cfg.agent }
        for (const [role, spec] of Object.entries(body.agent)) agents[role] = { ...agents[role], ...spec }
        cfg.agent = agents
        if (body.model) cfg.model = body.model
        if (body.small_model) cfg.small_model = body.small_model

        const commands = { ...cfg.command }
        for (const command of SLASH_COMMANDS) {
          commands[command.name] = {
            description: command.description,
            agent: "build",
            model: body.small_model,
            template: commandTemplate(command.args),
          }
        }
        cfg.command = commands
      } catch {
        /* never break OpenCode startup */
      }
    },

    // The CLI that the command template starts prints the result. This hook
    // applies the same table to the running session.
    "command.execute.before": async (cmd) => {
      const name = cmd.command.replace(/^\//, "")
      try {
        if (name === "refresh-routing") {
          clearApplyMarker()
          await applyToSession(await ensure(true))
        } else if (name === "routing-plan") {
          const plan = cmd.arguments.trim().split(/\s+/)[0]
          if (!isPlan(plan)) return
          clearApplyMarker()
          await applyToSession(await ensure(true, plan))
        }
      } catch (error) {
        writeApplyMarker({ ok: false, detail: `router command failed: ${errorMessage(error)}` })
      }
    },

    "chat.message": async (msgInput, output) => {
      try {
        const agent = msgInput.agent ?? output.message.agent
        if (!isAgentRole(agent)) return
        // A router slash command keeps the small model that its config sets.
        if (isRouterCommandPrompt(output.parts)) return
        const result = await ensure()
        const entry = pickForRole(result.table, agent, healthCheck(result, ledger))
        if (!entry) return
        sessionModels.set(msgInput.sessionID, entry.id)
        const current = output.message.model
        if (current?.providerID === entry.providerID && current.modelID === entry.modelID) return
        output.message.model = { providerID: entry.providerID, modelID: entry.modelID }
      } catch {
        /* never break a message */
      }
    },

    event: async ({ event }) => {
      try {
        if (event.type === "message.updated") {
          const info = event.properties.info
          if (info.role !== "assistant" || !info.time.completed || recordedMessages.has(info.id)) return
          rememberMessage(info.id)

          const id = `${info.providerID}/${info.modelID}`
          sessionModels.set(info.sessionID, id)
          const tokens =
            (info.tokens?.input ?? 0) +
            (info.tokens?.output ?? 0) +
            (info.tokens?.cache?.read ?? 0) +
            (info.tokens?.cache?.write ?? 0)
          let cost = info.cost ?? 0
          // Subscription turns may report $0. Estimate from the catalog so the
          // rolling ledger stays meaningful and failover still triggers.
          if (cost === 0 && tokens > 0) {
            await ensure()
            const blended = blendedById.get(id) ?? 0
            if (blended > 0) cost = (tokens / 1_000_000) * blended
          }
          ledger.record(id, cost, tokens)

          if (isRateLimitError(info.error)) ledger.cooldown(id, RATE_LIMIT_COOLDOWN_MS, "rate limit / quota")
          else if (isAuthError(info.error)) ledger.cooldown(id, AUTH_COOLDOWN_MS, "auth error")
        } else if (event.type === "session.error") {
          const { sessionID, error } = event.properties
          const id = sessionID ? sessionModels.get(sessionID) : undefined
          if (id && isRateLimitError(error)) ledger.cooldown(id, RATE_LIMIT_COOLDOWN_MS, "session rate limit")
        }
      } catch {
        /* ignore */
      }
    },
  }
}

export default OpencodeRouter
