import type {
  CatalogModel,
  ModelClass,
  PlanProfile,
  ResolvedConfig,
  RoleSpec,
  ScoreSource,
  ScoreTable,
  ScoredModel,
} from "./types.js"

export function modelClass(model: CatalogModel): ModelClass {
  if (model.free) return "free"
  if (model.providerID === "opencode-go") return "subscription"
  return "paid"
}

export interface FeedScores {
  /** keyed by lowercased family or `provider/model`. */
  byFamily: Map<string, { intelligence?: number; speed?: number }>
  byId: Map<string, { intelligence?: number; speed?: number }>
}

export function emptyFeedScores(): FeedScores {
  return { byFamily: new Map(), byId: new Map() }
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value))
}

function heuristicFor(model: CatalogModel, table: ScoreTable): { intelligence: number; speed: number } {
  const haystack = model.modelID.toLowerCase()
  for (const pattern of table.heuristics.patterns) {
    if (haystack.includes(pattern.match.toLowerCase())) {
      return { intelligence: pattern.intelligence, speed: pattern.speed }
    }
  }
  return { intelligence: table.heuristics.defaultIntelligence, speed: table.heuristics.defaultSpeed }
}

export function resolveIntelligence(
  model: CatalogModel,
  table: ScoreTable,
  feeds: FeedScores,
): { value: number; source: ScoreSource } {
  const override = table.models[model.id]
  if (override?.intelligence !== undefined) return { value: clamp(override.intelligence), source: "override" }

  const idFeed = feeds.byId.get(model.id.toLowerCase())
  if (idFeed?.intelligence !== undefined) return { value: clamp(idFeed.intelligence), source: "feed" }
  const famFeed = model.family ? feeds.byFamily.get(model.family.toLowerCase()) : undefined
  if (famFeed?.intelligence !== undefined) return { value: clamp(famFeed.intelligence), source: "feed" }

  const matched = table.heuristics.patterns.some((p) => model.modelID.toLowerCase().includes(p.match.toLowerCase()))
  const h = heuristicFor(model, table)
  return { value: clamp(h.intelligence), source: matched ? "heuristic" : "default" }
}

export function resolveSpeed(
  model: CatalogModel,
  table: ScoreTable,
  feeds: FeedScores,
): { value: number; source: ScoreSource } {
  const override = table.models[model.id]
  if (override?.speed !== undefined) return { value: clamp(override.speed), source: "override" }

  const idFeed = feeds.byId.get(model.id.toLowerCase())
  if (idFeed?.speed !== undefined) return { value: clamp(idFeed.speed), source: "feed" }
  const famFeed = model.family ? feeds.byFamily.get(model.family.toLowerCase()) : undefined
  if (famFeed?.speed !== undefined) return { value: clamp(famFeed.speed), source: "feed" }

  const matched = table.heuristics.patterns.some((p) => model.modelID.toLowerCase().includes(p.match.toLowerCase()))
  const h = heuristicFor(model, table)
  return { value: clamp(h.speed), source: matched ? "heuristic" : "default" }
}

/** Blended USD cost per 1M tokens for a typical coding turn. */
export function blendedCost(model: CatalogModel, cfg: ResolvedConfig): number {
  const { input, output, cacheRead } = cfg.blend
  const c = model.cost
  return c.input * input + c.output * output + (c.cacheRead ?? 0) * cacheRead
}

export function monthlyCap(model: CatalogModel, table: ScoreTable, plan: PlanProfile): number | null {
  if (plan === "free") return null
  const entry = table.monthlyCaps[model.id]
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

export function resolveEndurance(
  model: CatalogModel,
  table: ScoreTable,
  cfg: ResolvedConfig,
): EnduranceResult {
  const bc = blendedCost(model, cfg)

  if (model.free) {
    return { score: 100, source: "cap", tokensPer5h: null, monthlyCapUSD: null, blendedCost: bc }
  }

  const cap = monthlyCap(model, table, cfg.plan)
  if (cap === null) {
    return { score: 100, source: "cap", tokensPer5h: null, monthlyCapUSD: null, blendedCost: bc }
  }

  const cap5h = cap * 0.2
  if (bc <= 0) {
    return { score: 100, source: "cap", tokensPer5h: null, monthlyCapUSD: cap, blendedCost: bc }
  }

  const tokensPer5h = cap5h / bc
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
    if (klass === "free") score += 6
  } else {
    score += table.classPreference?.[cfg.plan]?.[klass] ?? 0
  }
  // Models we have never vetted score lower than ones with an explicit entry.
  if (table.models[model.id] === undefined) score -= table.heuristics.unvettedPenalty ?? 8
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
