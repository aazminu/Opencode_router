import { isAgentRole, PLAN_PROFILES, ROLE_NAMES } from "./types.js"
import type { CatalogModel, PlanProfile, RankingEntry, ResolvedConfig, RoleChains, RoleName, RoutingTable, ScoreTable } from "./types.js"
import { loadCatalog } from "./catalog.js"
import { loadFeedScores } from "./feeds.js"
import { loadUserConfig, resolveConfig } from "./config.js"
import { resolveTable } from "./score-table.js"
import { rankRole } from "./rank.js"
import { monthlyCapFor, type FeedScores } from "./scoring.js"
import { catalogCacheFile } from "./paths.js"
import type { LedgerStore } from "./ledger.js"

export interface BuildOptions {
  plan?: PlanProfile
  projectDir?: string
  catalogFile?: string
  catalog?: CatalogModel[]
  now?: Date
  feeds?: FeedScores
  notes?: string[]
}

export interface BuildResult {
  table: RoutingTable
  cfg: ResolvedConfig
  scoreTable: ScoreTable
  catalog: CatalogModel[]
}

export async function buildRoutingTable(opts: BuildOptions = {}): Promise<BuildResult> {
  const catalogFile = opts.catalogFile ?? catalogCacheFile()
  const catalog = opts.catalog ?? loadCatalog(catalogFile)
  const user = loadUserConfig(opts.projectDir)
  const notes: string[] = [...(opts.notes ?? []), ...user.notes]

  if (catalog.length === 0) {
    notes.push(`No models found in ${catalogFile}. Start OpenCode one time and sign in, then run this command again.`)
  }

  const cfg = resolveConfig(user.config, catalog, opts.plan)
  const scoreTable = resolveTable(user.config)

  let feeds = opts.feeds
  if (!feeds) {
    const loaded = await loadFeedScores(cfg)
    feeds = loaded.feeds
    if (loaded.note) notes.push(loaded.note)
  }

  const profiles: RoutingTable["profiles"] = {}
  for (const plan of PLAN_PROFILES) {
    const planCfg: ResolvedConfig = { ...cfg, plan }
    const chains: RoleChains = {}
    for (const role of ROLE_NAMES) {
      chains[role] = rankRole(catalog, role, scoreTable, planCfg, feeds)
    }
    profiles[plan] = chains
  }

  const table: RoutingTable = {
    version: 1,
    createdAt: (opts.now ?? new Date()).toISOString(),
    plan: cfg.plan,
    active: profiles[cfg.plan] ?? {},
    profiles,
    notes,
  }

  return { table, cfg, scoreTable, catalog }
}

/** Every entry of every active chain. */
export function activeEntries(table: RoutingTable): RankingEntry[] {
  return ROLE_NAMES.flatMap((role) => table.active[role] ?? [])
}

/** The model a role should use right now, given the ledger's health flags. */
export function pickForRole(
  table: RoutingTable,
  role: RoleName,
  isHealthy: (modelId: string) => boolean,
): RankingEntry | undefined {
  const chain = table.active[role]
  if (!chain || chain.length === 0) return undefined
  return chain.find((entry) => isHealthy(entry.id)) ?? chain[0]
}

/** Health check for one model id, from the ledger and the active plan's caps. */
export function healthCheck(result: BuildResult, ledger: LedgerStore): (modelId: string) => boolean {
  return (modelId) =>
    ledger.isHealthy(modelId, monthlyCapFor(modelId, result.scoreTable, result.cfg.plan), result.cfg.softThreshold)
}

/** Usage of each model in the 5-hour window, in percent of its 5-hour allowance. */
export function usagePercent(result: BuildResult, ledger: LedgerStore, modelId: string): number {
  return ledger.usage(modelId, monthlyCapFor(modelId, result.scoreTable, result.cfg.plan)).pct5h * 100
}

export type RoleState = "healthy" | "failover" | "limited" | "none"

export interface StatusRow {
  role: RoleName
  /** The model in use now; undefined when the role has no eligible model. */
  entry?: RankingEntry
  pct5h: number
  state: RoleState
}

/** The model each role uses now, after failover, with its 5-hour use. */
export function statusRows(result: BuildResult, ledger: LedgerStore): StatusRow[] {
  const isHealthy = healthCheck(result, ledger)
  return ROLE_NAMES.map((role): StatusRow => {
    // Only the agent roles switch per message; the internal roles keep the first model.
    const entry = isAgentRole(role) ? pickForRole(result.table, role, isHealthy) : result.table.active[role]?.[0]
    if (!entry) return { role, pct5h: 0, state: "none" }
    const state: RoleState = !isHealthy(entry.id) ? "limited" : entry.rank > 1 ? "failover" : "healthy"
    return { role, entry, pct5h: usagePercent(result, ledger, entry.id), state }
  })
}
