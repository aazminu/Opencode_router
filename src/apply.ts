import path from "node:path"
import { AGENT_ROLES, isAgentRole } from "./types.js"
import type { ConfigScope, RoutingTable } from "./types.js"
import {
  editJsonFile,
  fileExists,
  globalConfigDir,
  globalOpencodeConfigCandidates,
  opencodeConfigCandidates,
  type JsonEdit,
} from "./paths.js"

/** Internal roles that OpenCode configures as agents (`small_model` is a top-level key). */
const INTERNAL_AGENTS = ["compaction", "title", "summary"] as const

const SCHEMA_URL = "https://opencode.ai/config.json"

// Type aliases, not interfaces: OpenCode's Config type has index signatures,
// and only an alias gets the implicit index signature that matches them.
export type AgentModel = {
  model: string
  variant?: string
}

export type RoutingConfigBody = {
  model?: string
  small_model?: string
  agent: Record<string, AgentModel>
}

/** Build the OpenCode config fragment that expresses the routing table. */
export function routingConfigBody(table: RoutingTable): RoutingConfigBody {
  const agent: Record<string, AgentModel> = {}

  for (const role of AGENT_ROLES) {
    const entry = table.active[role]?.[0]
    if (!entry) continue
    agent[role] = entry.variant && entry.variant !== "none" ? { model: entry.id, variant: entry.variant } : { model: entry.id }
  }
  for (const role of INTERNAL_AGENTS) {
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
}

/** Pick the config file to write for the given scope. */
export function pickConfigPath(scope: ConfigScope, dir: string): string {
  const candidates = scope === "global" ? globalOpencodeConfigCandidates() : opencodeConfigCandidates(dir)
  for (const candidate of candidates) {
    if (fileExists(candidate)) return candidate
  }
  return scope === "global" ? path.join(globalConfigDir(), "opencode.json") : path.join(dir, "opencode.json")
}

/**
 * Write the routing table into the user's opencode.json(c). Only the keys the
 * router owns change: `model`, `small_model`, and `agent.<role>.model` (plus
 * `variant` for the agent roles). Comments and all other keys stay. A file
 * with a JSON error is never replaced: this throws and leaves it as it is.
 */
export function writeRoutingConfig(table: RoutingTable, scope: ConfigScope, dir: string): WriteResult {
  const target = pickConfigPath(scope, dir)
  const body = routingConfigBody(table)

  const edits: JsonEdit[] = []
  if (body.model) edits.push({ path: ["model"], value: body.model })
  if (body.small_model) edits.push({ path: ["small_model"], value: body.small_model })
  for (const [role, spec] of Object.entries(body.agent)) {
    edits.push({ path: ["agent", role, "model"], value: spec.model })
    if (isAgentRole(role)) edits.push({ path: ["agent", role, "variant"], value: spec.variant })
  }

  const { created } = editJsonFile(target, edits, `{\n  "$schema": "${SCHEMA_URL}"\n}\n`)
  return { path: target, created }
}

export interface ServerPatchResult {
  applied: boolean
  detail: string
}

/**
 * Best-effort live apply from the CLI: PATCH the running OpenCode server's
 * config. Used only when OPENCODE_SERVER_URL (+ optional basic auth) is set.
 */
export async function patchServerConfig(table: RoutingTable): Promise<ServerPatchResult> {
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
