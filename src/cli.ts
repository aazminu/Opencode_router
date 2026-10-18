import { parseArgs } from "node:util"
import path from "node:path"
import { buildRoutingTable } from "./engine.js"
import { formatScorecard, formatStatus } from "./format.js"
import { hotApply, writeRoutingConfig, readApplyMarker } from "./apply.js"
import { LedgerStore } from "./ledger.js"
import { resolveTable } from "./score-table.js"
import { loadUserConfig, mergeUserConfig } from "./config.js"
import { catalogMeta } from "./catalog.js"
import { globalRouterConfigFile, projectRouterConfigFile, globalStateDir, projectStateDir, readJson, writeJson, isProjectDir } from "./paths.js"
import type { PlanProfile } from "./types.js"

const HELP = `opencode-router - dynamic model routing for OpenCode Go / Go Plus / Free

Usage:
  opencode-router refresh [options]     Recompute the routing table and apply it
  opencode-router status  [options]     Show the current table and live quota use
  opencode-router plan <profile>        Set the plan profile (go | go-plus | free)
  opencode-router install [--scope]     Write slash commands + starter config
  opencode-router cat                   Show catalog metadata (source, age, count)
  opencode-router eval                  Run the scoring stress test (see evals/)

Options:
  --plan <go|go-plus|free>   Plan profile to use
  --scope <project|global>   Which opencode.json to write (default: project)
  --catalog <file>           Path to an OpenCode models.json cache
  --dry-run                  Do not write any file
  --no-apply                 Write config but do not hot-apply to the server
  --json                     Print machine-readable JSON
  --verbose                  Include score source tags
  -h, --help                 Show this help
`

function isPlan(value: string | undefined): value is PlanProfile {
  return value === "go" || value === "go-plus" || value === "free"
}

interface CommonOpts {
  plan?: PlanProfile
  scope: "project" | "global"
  scopeExplicit: boolean
  catalog?: string
  dryRun: boolean
  apply: boolean
  json: boolean
  verbose: boolean
}

/**
 * Resolve the config scope. When the caller did not pass --scope and the
 * current directory is not a real project (for example OpenCode's shell
 * injection runs from the home directory), fall back to the global config.
 */
export function resolveScope(explicit: boolean, value: "project" | "global", dir: string = process.cwd()): "project" | "global" {
  if (explicit) return value
  return isProjectDir(dir) ? "project" : "global"
}

function commonOptions(values: Record<string, unknown>): CommonOpts {
  const plan = typeof values.plan === "string" ? values.plan : undefined
  return {
    plan: isPlan(plan) ? plan : undefined,
    scope: values.scope === "global" ? "global" : "project",
    scopeExplicit: values.scope !== undefined,
    catalog: typeof values.catalog === "string" ? values.catalog : undefined,
    dryRun: values["dry-run"] === true,
    apply: values["no-apply"] !== true,
    json: values.json === true,
    verbose: values.verbose === true,
  }
}

async function cmdRefresh(opts: CommonOpts): Promise<number> {
  const { table } = await buildRoutingTable({ plan: opts.plan, catalogFile: opts.catalog })
  const body = { model: table.active.build?.[0]?.id, small_model: table.active.small_model?.[0]?.id, agents: Object.fromEntries(Object.entries(table.active).map(([r, c]) => [r, c[0]?.id])) }

  if (opts.json) {
    process.stdout.write(JSON.stringify({ table, applied: body }, null, 2) + "\n")
  } else {
    process.stdout.write(formatScorecard(table, { verbose: opts.verbose }) + "\n")
  }

  let detail = "dry-run: nothing written"
  let applied = false
  if (!opts.dryRun) {
    const scope = resolveScope(opts.scopeExplicit, opts.scope)
    const written = writeRoutingConfig(table, scope)
    detail = `${written.created ? "created" : "updated"} ${written.path}`
    // The plugin hot-applies before the CLI runs; report that instead of a
    // misleading "not applied" note.
    const marker = readApplyMarker()
    if (marker) {
      detail += ` | ${marker}`
      applied = true
    } else if (opts.apply) {
      const hot = await hotApply(table)
      detail += hot.applied ? ` | hot-applied (${hot.detail})` : ` | ${hot.detail}`
      applied = hot.applied
    }
  }

  if (!opts.json) {
    process.stdout.write(`\nApplied: ${detail}\n`)
    if (!opts.dryRun && !applied) {
      process.stdout.write(
        "A running OpenCode session recomputes routing on its next message (within 15 s). Restart to reload the UI display now.\n",
      )
    }
  }
  return 0
}

async function cmdStatus(opts: CommonOpts): Promise<number> {
  const { table, cfg, scoreTable } = await buildRoutingTable({ plan: opts.plan, catalogFile: opts.catalog })
  const scope = resolveScope(opts.scopeExplicit, opts.scope)
  const ledger = new LedgerStore(ledgerFile(scope), () => Date.now())
  const capFor = LedgerStore.capLookup(scoreTable, cfg.plan)

  const usage: Record<string, { pct: number; label: string }> = {}
  for (const entry of Object.values(table.active).flat()) {
    const u = ledger.usage(entry.id, capFor(entry.id))
    usage[entry.id] = { pct: u.pct5h * 100, label: `${(u.pct5h * 100).toFixed(0)}%` }
  }

  if (opts.json) {
    process.stdout.write(JSON.stringify({ table, usage }, null, 2) + "\n")
  } else {
    process.stdout.write(formatStatus(table, usage) + "\n")
  }
  return 0
}

function ledgerFile(scope: "project" | "global"): string {
  return scope === "global"
    ? path.join(globalStateDir(), "ledger.json")
    : path.join(projectStateDir(process.cwd()), "ledger.json")
}

function cmdPlan(profile: PlanProfile, scope: "project" | "global"): number {
  const file = scope === "global" ? globalRouterConfigFile() : projectRouterConfigFile(process.cwd())
  const existing = readJson<Record<string, unknown>>(file) ?? {}
  const merged = mergeUserConfig(existing as never, { plan: profile } as never) as Record<string, unknown>
  writeJson(file, merged)
  process.stdout.write(`Plan set to "${profile}" in ${file}\n`)
  process.stdout.write("Run `opencode-router refresh` (or /refresh-routing) to rebuild the routing table.\n")
  return 0
}

function cmdCat(catalog?: string): number {
  const meta = catalogMeta(catalog)
  process.stdout.write(`Catalog: ${meta.path}\n`)
  process.stdout.write(`Modified: ${meta.mtime ?? "missing"}\n`)
  process.stdout.write(`Routed models: ${meta.total}\n`)
  return 0
}

export async function main(argv: string[]): Promise<number> {
  const command = argv[0]
  if (!command || command === "-h" || command === "--help" || command === "help") {
    process.stdout.write(HELP)
    return 0
  }

  if (command === "plan") {
    const profile = argv[1]
    if (!isPlan(profile)) {
      process.stderr.write(`error: plan must be one of go | go-plus | free\n`)
      return 2
    }
    const { values } = parseArgs({ args: argv.slice(2), options: { scope: { type: "string" } }, allowPositionals: true })
    const scope = resolveScope(values.scope !== undefined, values.scope === "global" ? "global" : "project")
    return cmdPlan(profile, scope)
  }

  // OpenCode substitutes $1 with an empty string when the user passes no
  // arguments, which can leave an option without a value. Never crash on that:
  // fall back to defaults so the command still produces its output.
  let parsed
  try {
    parsed = parseArgs({
      args: argv.slice(1),
      options: {
        plan: { type: "string" },
        scope: { type: "string" },
        catalog: { type: "string" },
        "dry-run": { type: "boolean" },
        "no-apply": { type: "boolean" },
        json: { type: "boolean" },
        verbose: { type: "boolean" },
        help: { type: "boolean", short: "h" },
      },
      allowPositionals: true,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`opencode-router: ignoring bad arguments (${message})\n`)
    parsed = { values: {}, positionals: [] }
  }

  const opts = commonOptions(parsed.values as Record<string, unknown>)

  switch (command) {
    case "refresh":
      return cmdRefresh(opts)
    case "status":
      return cmdStatus(opts)
    case "cat":
      return cmdCat(opts.catalog)
    case "install": {
      const { installCommands } = await import("./install.js")
      const result = installCommands(resolveScope(opts.scopeExplicit, opts.scope))
      process.stdout.write(`Wrote ${result.files.length} command files to ${result.commandDir}\n`)
      process.stdout.write(`Wrote starter config: ${result.configPath}\n`)
      return 0
    }
    case "eval": {
      const { runEval } = await import("./eval.js")
      return runEval(opts)
    }
    default:
      process.stderr.write(`error: unknown command "${command}"\n\n${HELP}`)
      return 2
  }
}

main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code
  })
  .catch((error) => {
    process.stderr.write(`opencode-router failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
    process.exitCode = 1
  })
