import fs from "node:fs"
import type { CatalogModel, CostTier } from "./types.js"
import { catalogCacheFile } from "./paths.js"

export interface RawModel {
  id: string
  name?: string
  family?: string
  attachment?: boolean
  reasoning?: boolean
  tool_call?: boolean
  open_weights?: boolean
  release_date?: string
  last_updated?: string
  modalities?: { input?: string[]; output?: string[] }
  limit?: { context?: number; input?: number; output?: number }
  cost?: {
    input?: number
    output?: number
    cache_read?: number
    cache_write?: number
    tiers?: Array<{
      input?: number
      output?: number
      cache_read?: number
      cache_write?: number
      tier?: { type?: string; size?: number }
    }>
  }
}

export interface RawProvider {
  id: string
  name?: string
  models?: Record<string, RawModel>
}

export type RawCatalog = Record<string, RawProvider>

/** Providers this router understands. */
export const ROUTED_PROVIDERS = ["opencode-go", "opencode"] as const

export function readCatalogFile(file: string = catalogCacheFile()): RawCatalog | undefined {
  try {
    const raw = fs.readFileSync(file, "utf8")
    return JSON.parse(raw) as RawCatalog
  } catch {
    return undefined
  }
}

function toNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function mapTiers(raw: RawModel): CostTier[] {
  const tiers = raw.cost?.tiers
  if (!Array.isArray(tiers)) return []
  return tiers
    .filter((t) => t && t.tier && typeof t.tier.size === "number")
    .map((t) => ({
      size: t.tier!.size as number,
      input: toNumber(t.input),
      output: toNumber(t.output),
      cacheRead: t.cache_read !== undefined ? toNumber(t.cache_read) : undefined,
      cacheWrite: t.cache_write !== undefined ? toNumber(t.cache_write) : undefined,
    }))
    .sort((a, b) => a.size - b.size)
}

export function isFreeModel(cost: { input: number; output: number }, tiers: CostTier[]): boolean {
  const baseFree = cost.input === 0 && cost.output === 0
  const tiersFree = tiers.every((t) => t.input === 0 && t.output === 0)
  return baseFree && tiersFree
}

export function mapModel(providerID: string, raw: RawModel): CatalogModel {
  const cost = {
    input: toNumber(raw.cost?.input),
    output: toNumber(raw.cost?.output),
    cacheRead: raw.cost?.cache_read !== undefined ? toNumber(raw.cost.cache_read) : undefined,
    cacheWrite: raw.cost?.cache_write !== undefined ? toNumber(raw.cost.cache_write) : undefined,
  }
  const tiers = mapTiers(raw)
  const inputModalities = Array.isArray(raw.modalities?.input) ? raw.modalities!.input!.map(String) : ["text"]
  return {
    providerID,
    modelID: raw.id,
    id: `${providerID}/${raw.id}`,
    name: raw.name ?? raw.id,
    family: raw.family,
    releaseDate: raw.release_date ?? raw.last_updated,
    reasoning: raw.reasoning === true,
    toolCall: raw.tool_call === true,
    attachment: raw.attachment === true,
    openWeights: raw.open_weights === true,
    limit: {
      context: toNumber(raw.limit?.context),
      input: raw.limit?.input !== undefined ? toNumber(raw.limit.input) : undefined,
      output: toNumber(raw.limit?.output),
    },
    cost,
    tiers,
    inputModalities,
    free: isFreeModel(cost, tiers),
  }
}

/**
 * Load every routed model from the OpenCode catalog cache.
 * Returns models from `opencode-go` and `opencode` only.
 */
export function loadCatalog(file: string = catalogCacheFile()): CatalogModel[] {
  const raw = readCatalogFile(file)
  if (!raw) return []
  const out: CatalogModel[] = []
  for (const providerID of ROUTED_PROVIDERS) {
    const provider = raw[providerID]
    if (!provider?.models) continue
    for (const key of Object.keys(provider.models)) {
      const raws = provider.models[key]!
      out.push(mapModel(providerID, raws))
    }
  }
  return out
}

export function catalogMeta(file: string = catalogCacheFile()): { path: string; mtime: string | null; total: number } {
  let mtime: string | null = null
  try {
    mtime = fs.statSync(file).mtime.toISOString()
  } catch {
    mtime = null
  }
  return { path: file, mtime, total: loadCatalog(file).length }
}
