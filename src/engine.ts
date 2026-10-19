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

/** The model a role should use right now: the first usable model of its chain. */
export function pickForRole(
  table: RoutingTable,
  role: RoleName,
  isUsable: (entry: RankingEntry) => boolean,
): RankingEntry | undefined {
  const chain = table.active[role]
  if (!chain || chain.length === 0) return undefined
  return chain.find(isUsable) ?? chain[0]
}

/**
 * Usable = the model is not in cooldown, and, for a Go subscription model, the
 * shared allowance is under the soft threshold.
 */
export function healthCheck(result: BuildResult, ledger: LedgerStore): (entry: RankingEntry) => boolean {
  const allowanceOk = ledger.allowanceAvailable(result.cfg.softThreshold)
  return (entry) => !ledger.inCooldown(entry.id) && (allowanceOk || entry.class !== "subscription")
}

/** True when the model's use counts toward the shared Go allowance. */
export function usesAllowance(result: BuildResult, modelId: string): boolean {
  const cap = monthlyCapFor(modelId, result.scoreTable, result.cfg.plan)
  return cap !== null && cap > 0
}

/** The part of the monthly Go allowance that `costUSD` on this model uses. */
export function allowanceShare(result: BuildResult, modelId: string, costUSD: number): number {
  const cap = monthlyCapFor(modelId, result.scoreTable, result.cfg.plan)
  return cap !== null && cap > 0 ? costUSD / cap : 0
}

/**
 * healthy = first model; failover = a later model, because an earlier one is in
 * cooldown; free-fallback = a free model, because the Go allowance is near its
 * limit; limited = no usable model.
 */
export type RoleState = "healthy" | "failover" | "free-fallback" | "limited" | "none"

export interface StatusRow {
  role: RoleName
  /** The model in use now; undefined when the role has no eligible model. */
  entry?: RankingEntry
  state: RoleState
}

/** The model each role uses now, after failover. */
export function statusRows(result: BuildResult, ledger: LedgerStore): StatusRow[] {
  const isUsable = healthCheck(result, ledger)
  const allowanceOk = ledger.allowanceAvailable(result.cfg.softThreshold)
  return ROLE_NAMES.map((role): StatusRow => {
    // Only the agent roles switch per message; the internal roles keep the first model.
    const entry = isAgentRole(role) ? pickForRole(result.table, role, isUsable) : result.table.active[role]?.[0]
    if (!entry) return { role, state: "none" }
    const first = result.table.active[role]?.[0]
    let state: RoleState = "healthy"
    if (!isUsable(entry)) state = "limited"
    else if (entry.rank > 1 && entry.class === "free" && first?.class === "subscription" && !allowanceOk) state = "free-fallback"
    else if (entry.rank > 1) state = "failover"
    return { role, entry, state }
  })
}
