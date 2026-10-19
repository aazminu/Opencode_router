// Shared types and the constant lists they are built from.

export const PLAN_PROFILES = ["go", "go-plus", "free"] as const

export type PlanProfile = (typeof PLAN_PROFILES)[number]

export function isPlan(value: unknown): value is PlanProfile {
  return typeof value === "string" && (PLAN_PROFILES as readonly string[]).includes(value)
}

/** Which config files a command reads and writes. */
export type ConfigScope = "global" | "project"

/** OpenCode agents that the router switches per message. */
export const AGENT_ROLES = ["plan", "build", "general", "explore"] as const

/** Helper models that OpenCode reads from the config only. */
export const INTERNAL_ROLES = ["small_model", "title", "summary", "compaction"] as const

export const ROLE_NAMES = [...AGENT_ROLES, ...INTERNAL_ROLES] as const

export type AgentRole = (typeof AGENT_ROLES)[number]

export type InternalRole = (typeof INTERNAL_ROLES)[number]

export type RoleName = AgentRole | InternalRole

export function isAgentRole(value: string | undefined): value is AgentRole {
  return value !== undefined && (AGENT_ROLES as readonly string[]).includes(value)
}

export function isRoleName(value: string): value is RoleName {
  return (ROLE_NAMES as readonly string[]).includes(value)
}

export type ScoreSource = "override" | "cap" | "feed" | "heuristic" | "default"

export type ModelClass = "subscription" | "paid" | "free"

export interface Weights {
  intelligence: number
  speed: number
  endurance: number
}

/** Intelligence and speed values from the score table, a feed, or the user. */
export interface MetricScores {
  intelligence?: number
  speed?: number
}

export type Metric = keyof MetricScores

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
  /** Prefer $0 models; adds a bonus to the score of free models. */
  preferFree?: boolean
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

export type RoleChains = Partial<Record<RoleName, RankingEntry[]>>

export interface RoutingTable {
  version: number
  createdAt: string
  plan: PlanProfile
  /** role -> ranked chain for the active plan. */
  active: RoleChains
  /** plan -> role -> ranked chain (all computed plans). */
  profiles: Partial<Record<PlanProfile, RoleChains>>
  notes: string[]
}

export interface EnduranceScale {
  minTokensPer5h: number
  maxTokensPer5h: number
}

export interface CostBlend {
  input: number
  output: number
  cacheRead: number
}

export interface FeedConfig {
  enabled?: boolean
  url?: string
  timeoutMs?: number
}

export interface RouterUserConfig {
  plan?: PlanProfile
  chainDepth?: number
  softThreshold?: number
  blend?: Partial<CostBlend>
  enduranceScale?: Partial<EnduranceScale>
  weights?: Partial<Record<RoleName, Partial<Weights>>>
  roles?: Partial<Record<RoleName, Partial<RoleSpec>>>
  denyModels?: string[]
  allowModels?: string[]
  privacy?: { freeModelsOk?: boolean }
  feeds?: FeedConfig
  /** Ask npm for a newer router version once per 24 hours (default true). */
  updateCheck?: boolean
  /** Explicit score overrides, keyed by `provider/model`. */
  scores?: Partial<Record<string, MetricScores>>
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

export interface MonthlyCap {
  go: number | null
  goPlus: number | null
}

export interface ScoreTable {
  version: number
  updated: string
  /** role -> weights/variant/requirements. */
  roles: Partial<Record<RoleName, RoleSpec>>
  /** `provider/model` -> fixed scores (wins over heuristics). */
  models: Record<string, MetricScores>
  /** Ordered family/substring patterns; first match wins. */
  heuristics: {
    patterns: Array<{ match: string; intelligence: number; speed: number }>
    defaultIntelligence: number
    defaultSpeed: number
    /** Penalty applied to models with no explicit entry in `models`. */
    unvettedPenalty?: number
  }
  /** Monthly USD allowance per model: { go, goPlus }. null = unlimited. */
  monthlyCaps: Record<string, MonthlyCap>
  /**
   * Score adjustment per plan and model class. On paid plans the subscription
   * models get an edge so the plan you pay for is used first and $0 models
   * remain the overflow fallback.
   */
  classPreference?: Partial<Record<PlanProfile, Partial<Record<ModelClass, number>>>>
}

export interface ResolvedConfig extends RouterUserConfig {
  plan: PlanProfile
  chainDepth: number
  softThreshold: number
  blend: CostBlend
  enduranceScale: EnduranceScale
  denyModels: string[]
  allowModels: string[]
  privacy: { freeModelsOk: boolean }
}
