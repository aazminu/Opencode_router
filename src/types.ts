// Shared types for opencode-router.

export type PlanProfile = "go" | "go-plus" | "free"

export type InstallScope = "global" | "project"

export type BuiltinRole = "plan" | "build" | "general" | "explore"

export type InternalRole = "small_model" | "title" | "summary" | "compaction"

export type RoleName = BuiltinRole | InternalRole

export type ScoreSource = "override" | "cap" | "feed" | "heuristic" | "default"

export type ModelClass = "subscription" | "paid" | "free"

export interface Weights {
  intelligence: number
  speed: number
  endurance: number
}

export interface RoleRequirement {
  toolCall?: boolean
  reasoning?: boolean
  minContext?: number
  minOutput?: number
  inputModalities?: string[]
}

export interface RoleSpec {
  weights: Weights
  variant?: string
  chainDepth?: number
  requires?: RoleRequirement
  /** Prefer $0 models; adds a large bonus to the endurance term for free models. */
  preferFree?: boolean
  /** When false, $0 (data-collecting) models are excluded from this role. */
  allowFree?: boolean
  /** Avoid two adjacent picks from the same model family. */
  diversifyFamily?: boolean
}

export interface ModelCost {
  input: number
  output: number
  cacheRead?: number
  cacheWrite?: number
}

export interface CostTier {
  size: number
  input: number
  output: number
  cacheRead?: number
  cacheWrite?: number
}

export interface CatalogModel {
  providerID: string
  modelID: string
  /** Full `provider/model` identifier. */
  id: string
  name: string
  family?: string
  releaseDate?: string
  status?: string
  reasoning: boolean
  toolCall: boolean
  attachment: boolean
  openWeights: boolean
  limit: { context: number; input?: number; output: number }
  cost: ModelCost
  tiers: CostTier[]
  inputModalities: string[]
  free: boolean
}

export interface ScoredModel {
  model: CatalogModel
  intelligence: number
  speed: number
  endurance: number
  score: number
  intelligenceSource: ScoreSource
  speedSource: ScoreSource
  enduranceSource: ScoreSource
  blendedCost: number
  /** Estimated millions of tokens per 5h window; null means unlimited. */
  tokensPer5h: number | null
  /** Monthly dollar allowance; null means unlimited. */
  monthlyCapUSD: number | null
}

export interface RankingEntry {
  rank: number
  providerID: string
  modelID: string
  id: string
  variant?: string
  score: number
  intelligence: number
  speed: number
  endurance: number
  tokensPer5h: number | null
  monthlyCapUSD: number | null
  sources: { intelligence: ScoreSource; speed: ScoreSource; endurance: ScoreSource }
  class: ModelClass
}

export interface RoutingTable {
  version: number
  createdAt: string
  plan: PlanProfile
  /** role -> ranked chain for the active plan. */
  active: Record<string, RankingEntry[]>
  /** plan -> role -> ranked chain (all computed plans). */
  profiles: Partial<Record<PlanProfile, Record<string, RankingEntry[]>>>
  notes: string[]
}

export interface EnduranceScale {
  minTokensPer5h: number
  maxTokensPer5h: number
}

export interface RouterUserConfig {
  plan?: PlanProfile
  scope?: InstallScope
  chainDepth?: number
  softThreshold?: number
  blend?: { input: number; output: number; cacheRead: number }
  enduranceScale?: EnduranceScale
  weights?: Partial<Record<RoleName, Partial<Weights>>>
  roles?: Partial<Record<RoleName, Partial<RoleSpec>>>
  denyModels?: string[]
  allowModels?: string[]
  privacy?: { freeModelsOk?: boolean }
  budget?: { usdMonthly?: number }
  feeds?: { enabled?: boolean; url?: string; timeoutMs?: number }
  /** Explicit score overrides, keyed by `provider/model`. */
  scores?: Record<string, Partial<Pick<ScoredModel, "intelligence" | "speed">>>
}

export interface LedgerModelState {
  cost5h: number
  costWeek: number
  costMonth: number
  tokens5h: number
  tokensWeek: number
  tokensMonth: number
  window5hStart: number
  windowWeekStart: number
  windowMonthStart: number
  cooldownUntil?: number
  lastError?: string
  lastUsedAt?: number
}

export interface Ledger {
  version: number
  updatedAt: string
  models: Record<string, LedgerModelState>
}

export interface ScoreTable {
  version: number
  updated: string
  /** role -> weights/variant/requirements. */
  roles: Record<string, RoleSpec>
  /** `provider/model` -> fixed scores (wins over heuristics). */
  models: Record<string, { intelligence?: number; speed?: number }>
  /** Ordered family/substring patterns; first match wins. */
  heuristics: {
    patterns: Array<{ match: string; intelligence: number; speed: number }>
    defaultIntelligence: number
    defaultSpeed: number
    /** Penalty applied to models with no explicit entry in `models`. */
    unvettedPenalty?: number
  }
  /** Monthly USD allowance per model: { go, goPlus }. null = unlimited. */
  monthlyCaps: Record<string, { go: number | null; goPlus: number | null }>
  /**
   * Score adjustment per plan and model class. On paid plans the subscription
   * models get an edge so the plan you pay for is used first and $0 models
   * remain the overflow fallback.
   */
  classPreference?: Partial<Record<PlanProfile, Partial<Record<ModelClass, number>>>>
}

export interface ResolvedConfig extends RouterUserConfig {
  plan: PlanProfile
  scope: InstallScope
  chainDepth: number
  softThreshold: number
  blend: { input: number; output: number; cacheRead: number }
  enduranceScale: EnduranceScale
  denyModels: string[]
  allowModels: string[]
  privacy: { freeModelsOk: boolean }
}
