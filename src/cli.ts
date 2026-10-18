import { parseArgs } from "node:util"
import { activeEntries, buildRoutingTable, statusRows, usagePercent } from "./engine.js"
import { formatScorecard, formatStatus } from "./format.js"
import { patchServerConfig, routingConfigBody, writeRoutingConfig } from "./apply.js"
import { LedgerStore } from "./ledger.js"
import { catalogMeta } from "./catalog.js"
import { installCommands } from "./install.js"
import { runEval } from "./eval.js"
import { editJsonFile, globalRouterConfigFile, isProjectDir, projectRouterConfigFile, readJson } from "./paths.js"
import { ledgerFile, readApplyMarker } from "./state.js"
import { isPlan, PLAN_PROFILES } from "./types.js"
import type { ConfigScope, PlanProfile } from "./types.js"

const HELP = `opencode-router - dynamic model routing for OpenCode Go / Go Plus / Free

Usage:
  opencode-router refresh [options]     Recompute the routing table and apply it
  opencode-router status  [options]     Show the model in use per role and its 5-hour quota use
  opencode-router plan <profile>        Save the plan profile (go | go-plus | free) and rebuild
  opencode-router install [--scope]     Write slash-command files and a starter config
  opencode-router cat                   Show catalog metadata (path, date, model count)
  opencode-router eval                  Run the scoring stress test

Options:
  --plan <go|go-plus|free>   Plan profile for this run
  --scope <project|global>   Which config files to write (default: project in a project folder, else global)
  --catalog <file>           Path to an OpenCode models.json cache
  --dry-run                  Do not write opencode.json
  --no-apply                 Write opencode.json but do not send it to a running server
  --json                     Print machine-readable JSON
  --verbose                  Include score source tags
  -h, --help                 Show this help
`

const PLAN_CHOICES = PLAN_PROFILES.join(" | ")

/** A mistake in the command line: exit code 2 with a short message, no stack trace. */
class UsageError extends Error {}

interface CommonOpts {
  plan?: PlanProfile
  scope: ConfigScope
  catalog?: string
  dryRun: boolean
  apply: boolean
  json: boolean
  verbose: boolean
  cwd: string
}

/**
 * Resolve the config scope. When the caller did not pass --scope and the
 * directory is not a real project (for example OpenCode's shell runs from the
 * home directory), fall back to the global config.
 */
export function resolveScope(explicit: boolean, value: ConfigScope, dir: string): ConfigScope {
  if (explicit) return value
  return isProjectDir(dir) ? "project" : "global"
}

function parsePlan(value: string | undefined): PlanProfile | undefined {
  if (value === undefined) return undefined
  if (!isPlan(value)) throw new UsageError(`--plan must be one of ${PLAN_CHOICES}, not "${value}"`)
  return value
}

function parseScope(value: string | undefined): ConfigScope | undefined {
  if (value === undefined || value === "project" || value === "global") return value
  throw new UsageError(`--scope must be project or global, not "${value}"`)
}

function parseCommandLine(argv: string[], cwd: string) {
  let parsed
  try {
    parsed = parseArgs({
      args: argv,
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
    throw new UsageError(error instanceof Error ? error.message : String(error))
  }
  const { values, positionals } = parsed
  const scope = parseScope(values.scope)
  const opts: CommonOpts = {
    plan: parsePlan(values.plan),
    scope: resolveScope(scope !== undefined, scope ?? "project", cwd),
    catalog: values.catalog,
    dryRun: values["dry-run"] === true,
    apply: values["no-apply"] !== true,
    json: values.json === true,
    verbose: values.verbose === true,
    cwd,
  }
  return { command: positionals[0], args: positionals.slice(1), help: values.help === true, opts }
}

function build(opts: CommonOpts) {
  return buildRoutingTable({ plan: opts.plan, catalogFile: opts.catalog, projectDir: opts.cwd })
}

async function cmdRefresh(opts: CommonOpts): Promise<number> {
  const { table } = await build(opts)

  if (opts.json) {
    process.stdout.write(JSON.stringify({ table, routing: routingConfigBody(table) }, null, 2) + "\n")
  } else {
    process.stdout.write(formatScorecard(table, { verbose: opts.verbose }) + "\n")
  }

  let detail = "dry-run: nothing written"
  let applied = false
  if (!opts.dryRun) {
    const written = writeRoutingConfig(table, opts.scope, opts.cwd)
    detail = `${written.created ? "created" : "updated"} ${written.path}`
    // A slash command's plugin hook may have hot-applied the table already.
    const marker = readApplyMarker()
    if (marker) {
      detail += ` | ${marker.detail}`
      applied = marker.ok
    } else if (opts.apply) {
      const patch = await patchServerConfig(table)
      detail += patch.applied ? ` | hot-applied (${patch.detail})` : ` | ${patch.detail}`
      applied = patch.applied
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
  const result = await build(opts)
  const ledger = new LedgerStore(ledgerFile())
  const rows = statusRows(result, ledger)

  if (opts.json) {
    const usage: Record<string, { pct: number }> = {}
    for (const entry of activeEntries(result.table)) usage[entry.id] = { pct: usagePercent(result, ledger, entry.id) }
    process.stdout.write(JSON.stringify({ table: result.table, rows, usage }, null, 2) + "\n")
  } else {
    process.stdout.write(formatStatus(result.table, rows) + "\n")
  }
  return 0
}

async function cmdPlan(profile: string | undefined, opts: CommonOpts): Promise<number> {
  if (!isPlan(profile)) throw new UsageError(`plan must be one of ${PLAN_CHOICES}`)
  const file = opts.scope === "global" ? globalRouterConfigFile() : projectRouterConfigFile(opts.cwd)
  editJsonFile(file, [{ path: ["plan"], value: profile }])
  process.stdout.write(`Plan set to "${profile}" in ${file}\n`)

  if (opts.scope === "global") {
    const projectFile = projectRouterConfigFile(opts.cwd)
    const projectPlan = readJson<{ plan?: unknown }>(projectFile)?.plan
    if (projectPlan !== undefined && projectPlan !== profile) {
      process.stdout.write(
        `Note: ${projectFile} sets "plan": ${JSON.stringify(projectPlan)}, which overrides the global plan in this project.\n`,
      )
    }
  }

  process.stdout.write("\n")
  return cmdRefresh({ ...opts, plan: undefined })
}

function cmdCat(catalog?: string): number {
  const meta = catalogMeta(catalog)
  process.stdout.write(`Catalog: ${meta.path}\n`)
  process.stdout.write(`Modified: ${meta.mtime ?? "missing"}\n`)
  process.stdout.write(`Routed models: ${meta.total}\n`)
  return 0
}

function cmdInstall(opts: CommonOpts): number {
  const result = installCommands(opts.scope, opts.cwd)
  process.stdout.write(`Wrote ${result.files.length} command files to ${result.commandDir}\n`)
  process.stdout.write(
    result.configCreated ? `Wrote starter config: ${result.configPath}\n` : `Kept existing config: ${result.configPath}\n`,
  )
  return 0
}

function usageError(error: Error): number {
  process.stderr.write(`error: ${error.message}\n\nRun "opencode-router --help" for usage.\n`)
  return 2
}

/** Run one CLI command. Returns the exit code; never exits the process. */
export async function main(argv: string[], cwd: string = process.cwd()): Promise<number> {
  try {
    const { command, args, help, opts } = parseCommandLine(argv, cwd)
    if (!command || command === "help" || help) {
      process.stdout.write(HELP)
      return 0
    }
    switch (command) {
      case "refresh":
        return await cmdRefresh(opts)
      case "status":
        return await cmdStatus(opts)
      case "plan":
        return await cmdPlan(args[0], opts)
      case "cat":
        return cmdCat(opts.catalog)
      case "install":
        return cmdInstall(opts)
      case "eval":
        return await runEval({ plan: opts.plan, catalog: opts.catalog, json: opts.json, projectDir: opts.cwd })
      default:
        throw new UsageError(`unknown command "${command}"`)
    }
  } catch (error) {
    if (error instanceof UsageError) return usageError(error)
    throw error
  }
}
