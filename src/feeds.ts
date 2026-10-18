import type { ResolvedConfig } from "./types.js"
import { emptyFeedScores, type FeedScores } from "./scoring.js"

export interface FeedRecord {
  id?: string
  family?: string
  intelligence?: number
  speed?: number
}

export interface FeedPayload {
  version?: number
  updated?: string
  models?: FeedRecord[]
}

/**
 * Optionally enrich intelligence/speed from a public benchmark feed.
 * Any failure returns the empty map: the router falls back to the committed
 * table and heuristics, so `/refresh-routing` never breaks on a bad network.
 */
export async function loadFeedScores(cfg: ResolvedConfig): Promise<{ feeds: FeedScores; note: string | null }> {
  const feeds = emptyFeedScores()
  if (!cfg.feeds?.enabled || !cfg.feeds.url) return { feeds, note: null }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), cfg.feeds.timeoutMs ?? 5000)
  try {
    const res = await fetch(cfg.feeds.url, { signal: controller.signal })
    if (!res.ok) return { feeds, note: `feed ${cfg.feeds.url} returned ${res.status}; using table + heuristics` }
    const payload = (await res.json()) as FeedPayload
    const records = Array.isArray(payload.models) ? payload.models : []

    for (const rec of records) {
      if (!rec) continue
      const value: { intelligence?: number; speed?: number } = {}
      if (typeof rec.intelligence === "number") value.intelligence = rec.intelligence
      if (typeof rec.speed === "number") value.speed = rec.speed
      if (value.intelligence === undefined && value.speed === undefined) continue
      if (rec.id) feeds.byId.set(rec.id.toLowerCase(), value)
      if (rec.family) feeds.byFamily.set(rec.family.toLowerCase(), value)
    }
    return { feeds, note: `feed ${cfg.feeds.url}: ${records.length} records` }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { feeds, note: `feed unavailable (${message}); using table + heuristics` }
  } finally {
    clearTimeout(timeout)
  }
}
