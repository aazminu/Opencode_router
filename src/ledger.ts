import fs from "node:fs"
import type { Ledger, LedgerAllowance, LedgerModelState } from "./types.js"
import { isPlainObject, readJsonFile, writeJson } from "./paths.js"
import { FIVE_HOUR_SHARE, WEEK_SHARE } from "./scoring.js"

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
  cooldownUntil: number | null
}

/** Use of the shared Go allowance, as a part of each window's limit (1 = 100%). */
export interface AllowanceUsage {
  pct5h: number
  pctWeek: number
  pctMonth: number
  cooldownUntil: number | null
  /** Why the cooldown started; null without a cooldown. */
  cooldownReason: string | null
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

  /** `allowanceShare`: the cost divided by the model's monthly limit; 0 for a model outside the Go allowance. */
  record(modelId: string, costUSD: number, tokens: number, allowanceShare = 0): void {
    const state = this.state(modelId)
    state.cost5h += costUSD
    state.costWeek += costUSD
    state.costMonth += costUSD
    state.tokens5h += tokens
    state.tokensWeek += tokens
    state.tokensMonth += tokens
    state.lastUsedAt = this.now()
    if (allowanceShare > 0) this.addShare(allowanceShare)
    this.save()
  }

  /** Call after sync() or state(), never before: a reload would drop changes to the old data. */
  private sharedAllowance(): LedgerAllowance {
    if (!this.data.allowance || !Array.isArray(this.data.allowance.buckets)) this.data.allowance = { buckets: [] }
    return this.data.allowance
  }

  private addShare(share: number): void {
    const allowance = this.sharedAllowance()
    const now = this.now()
    const hour = Math.floor(now / HOUR) * HOUR
    allowance.buckets = allowance.buckets.filter(([start]) => start + HOUR > now - WINDOW_MONTH)
    const bucket = allowance.buckets.find(([start]) => start === hour)
    if (bucket) bucket[1] += share
    else allowance.buckets.push([hour, share])
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

  inCooldown(modelId: string): boolean {
    const until = this.state(modelId).cooldownUntil
    return until !== undefined && this.now() < until
  }

  /** After a usage-limit error: every model that uses the shared allowance is limited. */
  cooldownAllowance(durationMs: number, reason?: string): void {
    this.sync()
    const allowance = this.sharedAllowance()
    allowance.cooldownUntil = this.now() + durationMs
    if (reason) allowance.lastError = reason
    this.save()
  }

  usage(modelId: string): ModelUsage {
    const state = this.state(modelId)
    return {
      cost5h: state.cost5h,
      costMonth: state.costMonth,
      tokens5h: state.tokens5h,
      tokensMonth: state.tokensMonth,
      cooldownUntil: state.cooldownUntil ?? null,
    }
  }

  /** Rolling use of the shared allowance in the last 5 hours, 7 days, and 30 days. */
  allowance(): AllowanceUsage {
    this.sync()
    const allowance = this.sharedAllowance()
    const now = this.now()
    const cooldownUntil = allowance.cooldownUntil !== undefined && now < allowance.cooldownUntil ? allowance.cooldownUntil : null
    return {
      pct5h: windowShare(allowance.buckets, now, WINDOW_5H) / FIVE_HOUR_SHARE,
      pctWeek: windowShare(allowance.buckets, now, WINDOW_WEEK) / WEEK_SHARE,
      pctMonth: windowShare(allowance.buckets, now, WINDOW_MONTH),
      cooldownUntil,
      cooldownReason: cooldownUntil === null ? null : (allowance.lastError ?? null),
    }
  }

  /** True when no window has reached `softThreshold` and no usage-limit cooldown is active. */
  allowanceAvailable(softThreshold: number): boolean {
    const u = this.allowance()
    return u.cooldownUntil === null && u.pct5h < softThreshold && u.pctWeek < softThreshold && u.pctMonth < softThreshold
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

/**
 * Sum of the shares in the last `windowMs`. The use in one hour is taken as
 * even, so an hour that is partly inside the window counts in part.
 */
function windowShare(buckets: Array<[number, number]>, now: number, windowMs: number): number {
  const from = now - windowMs
  let sum = 0
  for (const [start, share] of buckets) {
    const end = Math.min(start + HOUR, now)
    if (end <= from || start > now) continue
    const span = end - start
    sum += span <= 0 ? share : (share * (end - Math.max(start, from))) / span
  }
  return sum
}
