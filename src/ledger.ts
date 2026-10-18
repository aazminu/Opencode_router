import fs from "node:fs"
import type { Ledger, LedgerModelState } from "./types.js"
import { isPlainObject, readJsonFile, writeJson } from "./paths.js"
import { FIVE_HOUR_SHARE } from "./scoring.js"

const HOUR = 3_600_000
const DAY = 24 * HOUR
export const WINDOW_5H = 5 * HOUR
export const WINDOW_WEEK = 7 * DAY
export const WINDOW_MONTH = 30 * DAY

/** A model is unhealthy once it has used this share of its monthly allowance. */
const MONTHLY_LIMIT = 0.95

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

function emptyLedger(now: number): Ledger {
  return { version: 1, updatedAt: new Date(now).toISOString(), models: {} }
}

function isLedger(value: unknown): value is Ledger {
  return isPlainObject(value) && value.version === 1 && isPlainObject(value.models)
}

function mtimeOf(file: string): number {
  try {
    return fs.statSync(file).mtimeMs
  } catch {
    return -1
  }
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

/**
 * Rolling spend per model, stored in one JSON file. Several OpenCode sessions
 * can share the file: each call reloads it when another process changed it.
 */
export class LedgerStore {
  private data: Ledger
  private loadedMtime = -1

  constructor(
    private readonly file: string,
    private readonly now: () => number = Date.now,
  ) {
    this.data = this.load()
  }

  /** Read the file. A corrupt file is kept as `<file>.corrupt-<time>` and a new ledger starts. */
  private load(): Ledger {
    this.loadedMtime = mtimeOf(this.file)
    const result = readJsonFile(this.file)
    if (result.status === "ok" && isLedger(result.value)) return result.value
    if (result.status !== "absent") {
      try {
        fs.renameSync(this.file, `${this.file}.corrupt-${this.now()}`)
      } catch {
        /* keep going with an empty ledger */
      }
      this.loadedMtime = -1
    }
    return emptyLedger(this.now())
  }

  private sync(): void {
    if (mtimeOf(this.file) !== this.loadedMtime) this.data = this.load()
  }

  /** Reset each window that has ended. */
  private roll(state: LedgerModelState, now: number): LedgerModelState {
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
    return state
  }

  private state(modelId: string): LedgerModelState {
    this.sync()
    const now = this.now()
    let entry = this.data.models[modelId]
    if (!entry) {
      entry = emptyState(now)
      this.data.models[modelId] = entry
    }
    return this.roll(entry, now)
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
    this.save()
  }

  cooldown(modelId: string, durationMs: number, reason?: string): void {
    const state = this.state(modelId)
    state.cooldownUntil = this.now() + durationMs
    if (reason) state.lastError = reason
    this.save()
  }

  clearCooldown(modelId: string): void {
    const state = this.state(modelId)
    state.cooldownUntil = undefined
    this.save()
  }

  usage(modelId: string, monthlyCapUSD: number | null): ModelUsage {
    return usageOf(this.state(modelId), monthlyCapUSD)
  }

  /** Healthy = not cooling down, under the soft threshold for 5 hours, and under the monthly limit. */
  isHealthy(modelId: string, monthlyCapUSD: number | null, softThreshold: number): boolean {
    const state = this.state(modelId)
    if (state.cooldownUntil && this.now() < state.cooldownUntil) return false
    const u = usageOf(state, monthlyCapUSD)
    return u.pct5h < softThreshold && u.pctMonth < MONTHLY_LIMIT
  }

  snapshot(): Ledger {
    return structuredClone(this.data)
  }

  save(): void {
    this.data.updatedAt = new Date(this.now()).toISOString()
    writeJson(this.file, this.data)
    this.loadedMtime = mtimeOf(this.file)
  }
}

function usageOf(state: LedgerModelState, monthlyCapUSD: number | null): ModelUsage {
  const cap5h = monthlyCapUSD === null ? null : monthlyCapUSD * FIVE_HOUR_SHARE
  return {
    cost5h: state.cost5h,
    costMonth: state.costMonth,
    tokens5h: state.tokens5h,
    tokensMonth: state.tokensMonth,
    pct5h: cap5h === null || cap5h <= 0 ? 0 : state.cost5h / cap5h,
    pctMonth: monthlyCapUSD === null || monthlyCapUSD <= 0 ? 0 : state.costMonth / monthlyCapUSD,
    cooldownUntil: state.cooldownUntil ?? null,
  }
}
