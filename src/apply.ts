import path from "node:path"
import fs from "node:fs"
import type { RoutingTable } from "./types.js"
import {
  ensureDir,
  fileExists,
  globalConfigDir,
  globalOpencodeConfigCandidates,
  globalStateDir,
  opencodeConfigCandidates,
  readJson,
  writeJson,
} from "./paths.js"

const AGENT_ROLES = ["plan", "build", "general", "explore"] as const
const INTERNAL_AGENT_ROLES = ["compaction", "title", "summary"] as const

export interface RoutingConfigBody {
  model?: string
  small_model?: string
  agent: Record<string, { model: string; variant?: string }>
}

/** Build the OpenCode config fragment that expresses the routing table. */
export function routingConfigBody(table: RoutingTable): RoutingConfigBody {
  const agent: Record<string, { model: string; variant?: string }> = {}

  for (const role of AGENT_ROLES) {
    const entry = table.active[role]?.[0]
    if (!entry) continue
    const spec = entry.variant && entry.variant !== "none" ? { model: entry.id, variant: entry.variant } : { model: entry.id }
    agent[role] = spec
  }
  for (const role of INTERNAL_AGENT_ROLES) {
    const entry = table.active[role]?.[0]
    if (!entry) continue
    agent[role] = { model: entry.id }
  }

  const body: RoutingConfigBody = { agent }
  const build = table.active.build?.[0]
  const small = table.active.small_model?.[0]
  if (build) body.model = build.id
  if (small) body.small_model = small.id
  return body
}

export interface WriteResult {
  path: string
  created: boolean
  previous: Partial<RoutingConfigBody> | null
}

/** Pick the config file to write for the given scope. */
export function pickConfigPath(scope: "global" | "project", dir: string): string {
  const candidates = scope === "global" ? globalOpencodeConfigCandidates() : opencodeConfigCandidates(dir)
  for (const candidate of candidates) {
    if (fileExists(candidate)) return candidate
  }
  return scope === "global"
    ? path.join(globalConfigDir(), "opencode.json")
    : path.join(dir, "opencode.json")
}

/**
 * Merge the routing table into the user's opencode.json(c) without touching
 * unrelated keys. Preserves `$schema` and any other fields the user has.
 */
export function writeRoutingConfig(
  table: RoutingTable,
  scope: "global" | "project",
  dir: string = process.cwd(),
): WriteResult {
  const target = pickConfigPath(scope, dir)
  const created = !fileExists(target)
  const existing = (readJson<Record<string, unknown>>(target) ?? {}) as Record<string, unknown>

  const previous: Partial<RoutingConfigBody> | null =
    existing.agent || existing.model || existing.small_model
      ? {
          model: existing.model as string | undefined,
          small_model: existing.small_model as string | undefined,
          agent: existing.agent as RoutingConfigBody["agent"] | undefined,
        }
      : null

  const body = routingConfigBody(table)
  const merged: Record<string, unknown> = {
    ...existing,
    $schema: existing.$schema ?? "https://opencode.ai/config.json",
    agent: { ...(existing.agent as object | undefined), ...body.agent },
  }
  if (body.model) merged.model = body.model
  if (body.small_model) merged.small_model = body.small_model

  ensureDir(path.dirname(target))
  writeJson(target, merged)
  return { path: target, created, previous }
}

/** The routing config a user should add to `plugin` in opencode.json. */
export function pluginEntrySpec(): string {
  try {
    const pkg = readJson<{ name?: string; version?: string }>(path.join(process.cwd(), "package.json"))
    if (pkg?.name && pkg.name === "opencode-router") return "opencode-router"
  } catch {
    /* ignore */
  }
  return "opencode-router"
}

export interface HotApplyResult {
  applied: boolean
  detail: string
}

/** Marker the plugin writes after a successful in-session hot-apply. */
export function applyMarkerFile(): string {
  return path.join(globalStateDir(), "last-apply.json")
}

export function writeApplyMarker(detail: string): void {
  writeJson(applyMarkerFile(), { at: new Date().toISOString(), detail })
}

export function readApplyMarker(maxAgeMs = 60_000): string | null {
  const marker = readJson<{ at?: string; detail?: string }>(applyMarkerFile())
  if (!marker?.at || !marker.detail) return null
  const at = Date.parse(marker.at)
  if (!Number.isFinite(at) || Date.now() - at > maxAgeMs) return null
  return marker.detail
}

export function clearApplyMarker(): void {
  try {
    fs.rmSync(applyMarkerFile(), { force: true })
  } catch {
    /* ignore */
  }
}

/**
 * Best-effort live apply: PATCH the running OpenCode server's config so the
 * running session picks up the new model assignment without a restart.
 * Honors OPENCODE_SERVER_URL (+ basic auth) when set.
 */
export async function hotApply(table: RoutingTable): Promise<HotApplyResult> {
  const base = process.env.OPENCODE_SERVER_URL ?? process.env.OPENCODE_SERVER
  if (!base) {
    return { applied: false, detail: "live PATCH not attempted (no OPENCODE_SERVER_URL set)" }
  }

  const url = base.replace(/\/$/, "") + "/config"
  const headers: Record<string, string> = { "content-type": "application/json" }
  const user = process.env.OPENCODE_SERVER_USERNAME
  const pass = process.env.OPENCODE_SERVER_PASSWORD
  if (user && pass) headers.authorization = "Basic " + Buffer.from(`${user}:${pass}`).toString("base64")

  try {
    const res = await fetch(url, { method: "PATCH", headers, body: JSON.stringify(routingConfigBody(table)) })
    if (!res.ok) return { applied: false, detail: `PATCH ${url} -> ${res.status}` }
    return { applied: true, detail: `PATCH ${url}` }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { applied: false, detail: `PATCH failed: ${message}` }
  }
}

export function hasExistingRouterConfig(dir: string): boolean {
  return opencodeConfigCandidates(dir).some((c) => fileExists(c)) || globalOpencodeConfigCandidates().some((c) => fileExists(c))
}

export function readRawConfig(dir: string): string | null {
  for (const candidate of opencodeConfigCandidates(dir)) {
    if (fileExists(candidate)) return fs.readFileSync(candidate, "utf8")
  }
  for (const candidate of globalOpencodeConfigCandidates()) {
    if (fileExists(candidate)) return fs.readFileSync(candidate, "utf8")
  }
  return null
}
