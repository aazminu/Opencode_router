import type {
  CatalogModel,
  PlanProfile,
  RankingEntry,
  ResolvedConfig,
  RoleName,
  RoutingTable,
  ScoreTable,
} from "./types.js"
import { loadCatalog } from "./catalog.js"
import { loadFeedScores } from "./feeds.js"
import { loadUserConfig, resolveConfig } from "./config.js"
import { resolveTable } from "./score-table.js"
import { rankAllRoles, rankRole } from "./rank.js"
import { emptyFeedScores, type FeedScores } from "./scoring.js"

export const PLAN_PROFILES: PlanProfile[] = ["go", "go-plus", "free"]

export interface BuildOptions {
  plan?: PlanProfile
  projectDir?: string
  catalogFile?: string
  catalog?: CatalogModel[]
  now?: Date
  feeds?: FeedScores
  notes?: string[]
  userConfigDir?: string
}

export interface BuildResult {
  table: RoutingTable
  cfg: ResolvedConfig
  scoreTable: ScoreTable
  catalog: CatalogModel[]
}

export async function buildRoutingTable(opts: BuildOptions = {}): Promise<BuildResult> {
  const catalog = opts.catalog ?? loadCatalog(opts.catalogFile)
  const user = loadUserConfig(opts.projectDir)
  const notes: string[] = [...(opts.notes ?? [])]

  if (catalog.length === 0) {
    notes.push("No models found. Is OpenCode installed? Expected the catalog at ~/.cache/opencode/models.json.")
  }

  const cfg = resolveConfig(user, catalog, opts.plan)
  const scoreTable = resolveTable(user)

  let feeds = opts.feeds
  if (!feeds) {
    const loaded = await loadFeedScores(cfg)
    feeds = loaded.feeds
    if (loaded.note) notes.push(loaded.note)
  }

  const profiles: Partial<Record<PlanProfile, Record<RoleName, RankingEntry[]>>> = {}
  for (const plan of PLAN_PROFILES) {
    const planCfg: ResolvedConfig = { ...cfg, plan }
    const perRole = {} as Record<RoleName, RankingEntry[]>
    for (const roleName of Object.keys(scoreTable.roles) as RoleName[]) {
      perRole[roleName] = rankRole(catalog, roleName, scoreTable, planCfg, feeds)
    }
    profiles[plan] = perRole
  }

  const active = profiles[cfg.plan] ?? ({} as Record<RoleName, RankingEntry[]>)

  const table: RoutingTable = {
    version: 1,
    createdAt: (opts.now ?? new Date()).toISOString(),
    plan: cfg.plan,
    active,
    profiles,
    notes,
  }

  return { table, cfg, scoreTable, catalog }
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

export function defaultFeeds(): FeedScores {
  return emptyFeedScores()
}
