import path from "node:path"
import type { Ledger, LedgerModelState, PlanProfile, ScoreTable } from "./types.js"
import { ensureDir, readJson, writeJson } from "./paths.js"

const HOUR = 3_600_000
const DAY = 24 * HOUR
export const WINDOW_5H = 5 * HOUR
export const WINDOW_WEEK = 7 * DAY
export const WINDOW_MONTH = 30 * DAY

function emptyState(now: number): LedgerModelState {
  return {
    cost5h: 0,
    costWeek: 0,
    costMonth: 0,
    tokens5h: 0,
    tokensWeek: 0,
    tokensMonth: 0,
    window5hStart: now,
    windowWeekStart: now,
    windowMonthStart: now,
  }
}

function rollWindow(now: number): LedgerModelState {
  const base = emptyState(now)
  return base
}

export interface ModelUsage {
  cost5h: number
  costMonth: number
  tokens5h: number
  tokensMonth: number
  pct5h: number
  pctMonth: number
  cooldownUntil: number | null
}

export class LedgerStore {
  private data: Ledger

  constructor(private file: string, private now: () => number = Date.now) {
    this.data = this.read()
  }

  private read(): Ledger {
    const raw = readJson<Ledger>(this.file)
    if (raw && raw.version === 1 && raw.models) return raw
    return { version: 1, updatedAt: new Date(this.now()).toISOString(), models: {} }
  }

  private touch(state: LedgerModelState, now: number): LedgerModelState {
    if (now - state.window5hStart >= WINDOW_5H) {
      state.cost5h = 0
      state.tokens5h = 0
      state.window5hStart = now
    }
    if (now - state.windowWeekStart >= WINDOW_WEEK) {
      state.costWeek = 0
      state.tokensWeek = 0
      state.windowWeekStart = now
    }
    if (now - state.windowMonthStart >= WINDOW_MONTH) {
      state.costMonth = 0
      state.tokensMonth = 0
      state.windowMonthStart = now
    }
    if (now >= state.window5hStart + WINDOW_5H) state.window5hStart = now
    return state
  }

  private state(modelId: string): LedgerModelState {
    const now = this.now()
    let entry = this.data.models[modelId]
    if (!entry) {
      entry = rollWindow(now)
      this.data.models[modelId] = entry
    }
    return this.touch(entry, now)
  }

  record(modelId: string, costUSD: number, tokens: number): void {
    const state = this.state(modelId)
    state.cost5h += costUSD
    state.costWeek += costUSD
    state.costMonth += costUSD
    state.tokens5h += tokens
    state.tokensWeek += tokens
    state.tokensMonth += tokens
    state.lastUsedAt = this.now()
    this.data.updatedAt = new Date(this.now()).toISOString()
    this.save()
  }

  cooldown(modelId: string, durationMs: number, reason?: string): void {
    const state = this.state(modelId)
    state.cooldownUntil = this.now() + durationMs
    if (reason) state.lastError = reason
    this.data.updatedAt = new Date(this.now()).toISOString()
    this.save()
  }

  clearCooldown(modelId: string): void {
    const state = this.state(modelId)
    state.cooldownUntil = undefined
    this.save()
  }

  usage(modelId: string, monthlyCapUSD: number | null): ModelUsage {
    const state = this.state(modelId)
    const cap5h = monthlyCapUSD === null ? null : monthlyCapUSD * 0.2
    const pct5h = cap5h === null || cap5h <= 0 ? 0 : state.cost5h / cap5h
    const pctMonth = monthlyCapUSD === null || monthlyCapUSD <= 0 ? 0 : state.costMonth / monthlyCapUSD
    return {
      cost5h: state.cost5h,
      costMonth: state.costMonth,
      tokens5h: state.tokens5h,
      tokensMonth: state.tokensMonth,
      pct5h,
      pctMonth,
      cooldownUntil: state.cooldownUntil ?? null,
    }
  }

  /** Healthy = not cooling down and under the soft threshold on every window. */
  isHealthy(modelId: string, monthlyCapUSD: number | null, softThreshold: number): boolean {
    const now = this.now()
    const state = this.state(modelId)
    if (state.cooldownUntil && now < state.cooldownUntil) return false
    const u = this.usage(modelId, monthlyCapUSD)
    return u.pct5h < softThreshold && u.pctMonth < 0.95
  }

  snapshot(): Ledger {
    return structuredClone(this.data)
  }

  save(): void {
    ensureDir(path.dirname(this.file))
    writeJson(this.file, this.data)
  }

  static capLookup(table: ScoreTable, plan: PlanProfile) {
    return (modelId: string): number | null => {
      if (plan === "free") return null
      const entry = table.monthlyCaps[modelId]
      if (!entry) return null
      return plan === "go-plus" ? entry.goPlus : entry.go
    }
  }
}
