import type {
  CatalogModel,
  Metric,
  MetricScores,
  ModelClass,
  PlanProfile,
  ResolvedConfig,
  RoleSpec,
  ScoreSource,
  ScoreTable,
  ScoredModel,
} from "./types.js"

/** Share of the monthly allowance that one 5-hour window may use. */
export const FIVE_HOUR_SHARE = 0.2
/** Share of the monthly allowance that one 7-day window may use. */
export const WEEK_SHARE = 0.5

/** Score bonus for a free model in a role that prefers free models. */
const FREE_ROLE_BONUS = 6

const DEFAULT_UNVETTED_PENALTY = 8

export function modelClass(model: CatalogModel): ModelClass {
  if (model.free) return "free"
  if (model.providerID === "opencode-go") return "subscription"
  return "paid"
}

export interface FeedScores {
  /** keyed by lowercased family or `provider/model`. */
  byFamily: Map<string, MetricScores>
  byId: Map<string, MetricScores>
}

export function emptyFeedScores(): FeedScores {
  return { byFamily: new Map(), byId: new Map() }
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value))
}

/** Resolve one metric: score table/user override, then feed, then name pattern, then default. */
function resolveMetric(
  model: CatalogModel,
  table: ScoreTable,
  feeds: FeedScores,
  metric: Metric,
): { value: number; source: ScoreSource } {
  const override = table.models[model.id]?.[metric]
  if (override !== undefined) return { value: clamp(override), source: "override" }

  const fromId = feeds.byId.get(model.id.toLowerCase())?.[metric]
  if (fromId !== undefined) return { value: clamp(fromId), source: "feed" }
  const fromFamily = model.family ? feeds.byFamily.get(model.family.toLowerCase())?.[metric] : undefined
  if (fromFamily !== undefined) return { value: clamp(fromFamily), source: "feed" }

  const id = model.modelID.toLowerCase()
  const pattern = table.heuristics.patterns.find((p) => id.includes(p.match.toLowerCase()))
  if (pattern) return { value: clamp(pattern[metric]), source: "heuristic" }

  const fallback = metric === "intelligence" ? table.heuristics.defaultIntelligence : table.heuristics.defaultSpeed
  return { value: clamp(fallback), source: "default" }
}

export function resolveIntelligence(model: CatalogModel, table: ScoreTable, feeds: FeedScores) {
  return resolveMetric(model, table, feeds, "intelligence")
}

export function resolveSpeed(model: CatalogModel, table: ScoreTable, feeds: FeedScores) {
  return resolveMetric(model, table, feeds, "speed")
}

/** Blended USD cost per 1M tokens for a typical coding turn. */
export function blendedCost(model: CatalogModel, cfg: ResolvedConfig): number {
  const { input, output, cacheRead } = cfg.blend
  const c = model.cost
  return c.input * input + c.output * output + (c.cacheRead ?? 0) * cacheRead
}

/** Monthly USD allowance of a model on a plan; null means unlimited or unknown. */
export function monthlyCapFor(modelId: string, table: ScoreTable, plan: PlanProfile): number | null {
  if (plan === "free") return null
  const entry = table.monthlyCaps[modelId]
  if (!entry) return null
  return plan === "go-plus" ? entry.goPlus : entry.go
}

function logScale(value: number, min: number, max: number): number {
  const lo = Math.log10(Math.max(min, 1e-6))
  const hi = Math.log10(Math.max(max, min * 1.001))
  const v = Math.log10(Math.max(value, 1e-6))
  return clamp(((v - lo) / (hi - lo)) * 100)
}

export interface EnduranceResult {
  score: number
  source: ScoreSource
  tokensPer5h: number | null
  monthlyCapUSD: number | null
  blendedCost: number
}

export function resolveEndurance(model: CatalogModel, table: ScoreTable, cfg: ResolvedConfig): EnduranceResult {
  const bc = blendedCost(model, cfg)

  if (model.free) {
    return { score: 100, source: "cap", tokensPer5h: null, monthlyCapUSD: null, blendedCost: bc }
  }

  const cap = monthlyCapFor(model.id, table, cfg.plan)
  if (cap === null) {
    return { score: 100, source: "cap", tokensPer5h: null, monthlyCapUSD: null, blendedCost: bc }
  }

  if (bc <= 0) {
    return { score: 100, source: "cap", tokensPer5h: null, monthlyCapUSD: cap, blendedCost: bc }
  }

  const tokensPer5h = (cap * FIVE_HOUR_SHARE) / bc
  const score = logScale(tokensPer5h, cfg.enduranceScale.minTokensPer5h, cfg.enduranceScale.maxTokensPer5h)
  return { score, source: "cap", tokensPer5h, monthlyCapUSD: cap, blendedCost: bc }
}

export function scoreModel(
  model: CatalogModel,
  role: RoleSpec,
  table: ScoreTable,
  cfg: ResolvedConfig,
  feeds: FeedScores,
): ScoredModel {
  const intel = resolveIntelligence(model, table, feeds)
  const speed = resolveSpeed(model, table, feeds)
  const end = resolveEndurance(model, table, cfg)

  const w = role.weights
  let score = w.intelligence * intel.value + w.speed * speed.value + w.endurance * end.score

  // Plan/class preference: on paid plans keep the subscription models ahead of
  // the $0 overflow; for free-preferring roles do the opposite.
  const klass = modelClass(model)
  if (role.preferFree) {
    if (klass === "free") score += FREE_ROLE_BONUS
  } else {
    score += table.classPreference?.[cfg.plan]?.[klass] ?? 0
  }
  // Models we have never vetted score lower than ones with an explicit entry.
  if (table.models[model.id] === undefined) score -= table.heuristics.unvettedPenalty ?? DEFAULT_UNVETTED_PENALTY
  score = clamp(score)

  return {
    model,
    intelligence: intel.value,
    speed: speed.value,
    endurance: end.score,
    score,
    intelligenceSource: intel.source,
    speedSource: speed.source,
    enduranceSource: end.source,
    blendedCost: end.blendedCost,
    tokensPer5h: end.tokensPer5h,
    monthlyCapUSD: end.monthlyCapUSD,
  }
}
