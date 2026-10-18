import type { CatalogModel, PlanProfile, RankingEntry, ResolvedConfig, RoleName, RoleSpec, ScoreTable, ScoredModel } from "./types.js"
import { modelClass, scoreModel, type FeedScores } from "./scoring.js"

export function globToRegex(glob: string): RegExp {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".")
  return new RegExp(`^${escaped}$`, "i")
}

export function matchesAny(id: string, globs: string[]): boolean {
  return globs.some((g) => globToRegex(g).test(id))
}

function providerAllowed(model: CatalogModel, plan: PlanProfile): boolean {
  if (plan === "free") {
    // Without any subscription, only the OpenCode Zen `$0` tier is reachable.
    return model.providerID === "opencode" && model.free
  }
  if (plan === "go" || plan === "go-plus") {
    // OpenCode Go subscription models plus the $0 free tier from both providers.
    if (model.providerID === "opencode-go") return true
    if (model.providerID === "opencode") return model.free
    return false
  }
  return false
}

function requirementOk(model: CatalogModel, role: RoleSpec): boolean {
  const req = role.requires
  if (!req) return true
  if (req.toolCall && !model.toolCall) return false
  if (req.reasoning && !model.reasoning) return false
  if (req.minContext !== undefined && model.limit.context < req.minContext) return false
  if (req.minOutput !== undefined && model.limit.output < req.minOutput) return false
  if (req.inputModalities && req.inputModalities.length > 0) {
    const ok = req.inputModalities.every((m) => model.inputModalities.includes(m))
    if (!ok) return false
  }
  return true
}

export function eligibleModels(
  catalog: CatalogModel[],
  role: RoleSpec,
  table: ScoreTable,
  cfg: ResolvedConfig,
): CatalogModel[] {
  return catalog.filter((model) => {
    if (!providerAllowed(model, cfg.plan)) return false
    if (!requirementOk(model, role)) return false
    // On paid plans, a non-free Go model with no known allowance is treated as
    // unavailable (legacy/retired ids would otherwise look "unlimited").
    if ((cfg.plan === "go" || cfg.plan === "go-plus") && !model.free && !table.monthlyCaps[model.id]) return false
    if (cfg.denyModels.length > 0 && matchesAny(model.id, cfg.denyModels)) return false
    if (cfg.allowModels.length > 0 && !matchesAny(model.id, cfg.allowModels)) return false
    // Privacy: paid plans must not silently use data-collecting free models for real work.
    if (!cfg.privacy.freeModelsOk && model.free && !role.preferFree) return false
    return true
  })
}

export function rankRole(
  catalog: CatalogModel[],
  roleName: RoleName,
  table: ScoreTable,
  cfg: ResolvedConfig,
  feeds: FeedScores,
): RankingEntry[] {
  const role = table.roles[roleName]
  if (!role) return []

  const scored: ScoredModel[] = eligibleModels(catalog, role, table, cfg)
    .map((model) => scoreModel(model, role, table, cfg, feeds))
    .sort((a, b) => b.score - a.score || a.blendedCost - b.blendedCost)

  const depth = role.chainDepth ?? cfg.chainDepth
  const diversify = role.diversifyFamily ?? false

  const chosen: ScoredModel[] = []
  const seenFamilies = new Set<string>()

  for (const entry of scored) {
    if (chosen.length >= depth) break
    const family = (entry.model.family ?? entry.model.modelID).toLowerCase()
    if (diversify && seenFamilies.has(family) && chosen.length < depth) continue
    chosen.push(entry)
    seenFamilies.add(family)
  }
  // Backfill if diversification starved the chain.
  if (chosen.length < depth) {
    for (const entry of scored) {
      if (chosen.length >= depth) break
      if (chosen.includes(entry)) continue
      chosen.push(entry)
    }
  }

  return chosen.map((entry, index) => ({
    rank: index + 1,
    providerID: entry.model.providerID,
    modelID: entry.model.modelID,
    id: entry.model.id,
    variant: role.variant,
    score: round(entry.score),
    intelligence: round(entry.intelligence),
    speed: round(entry.speed),
    endurance: round(entry.endurance),
    tokensPer5h: entry.tokensPer5h === null ? null : round(entry.tokensPer5h, 3),
    monthlyCapUSD: entry.monthlyCapUSD,
    sources: {
      intelligence: entry.intelligenceSource,
      speed: entry.speedSource,
      endurance: entry.enduranceSource,
    },
    class: modelClass(entry.model),
  }))
}

function round(value: number, digits = 1): number {
  const f = Math.pow(10, digits)
  return Math.round(value * f) / f
}
