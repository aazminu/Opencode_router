import bundled from "../model-scores.json" with { type: "json" }
import type { RoleSpec, RouterUserConfig, ScoreTable } from "./types.js"

/** The committed default table, loaded from model-scores.json at build time. */
export function loadDefaultTable(): ScoreTable {
  return bundled as unknown as ScoreTable
}

function deepMergeRole(base: RoleSpec, override: Partial<RoleSpec>): RoleSpec {
  return {
    ...base,
    ...override,
    weights: { ...base.weights, ...(override.weights ?? {}) },
    requires: { ...base.requires, ...(override.requires ?? {}) },
  }
}

/**
 * Build the effective score table: committed defaults, then user overrides from
 * router.config.json (per-role weights/specs and per-model scores).
 */
export function resolveTable(user: RouterUserConfig): ScoreTable {
  const table = structuredClone(loadDefaultTable())

  if (user.roles) {
    for (const [role, spec] of Object.entries(user.roles)) {
      if (!spec) continue
      const base = table.roles[role] ?? ({} as RoleSpec)
      table.roles[role] = deepMergeRole(base, spec)
    }
  }

  if (user.weights) {
    for (const [role, weights] of Object.entries(user.weights)) {
      if (!weights) continue
      const base = table.roles[role]
      if (!base) continue
      base.weights = { ...base.weights, ...weights }
    }
  }

  if (user.scores) {
    for (const [id, score] of Object.entries(user.scores)) {
      if (!score) continue
      table.models[id] = { ...(table.models[id] ?? {}), ...score }
    }
  }

  return table
}
