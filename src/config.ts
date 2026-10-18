import { isPlan, isRoleName, PLAN_PROFILES } from "./types.js"
import type { CatalogModel, PlanProfile, ResolvedConfig, RouterUserConfig } from "./types.js"
import { globalRouterConfigFile, isPlainObject, projectRouterConfigFile, readJsonFile } from "./paths.js"

const DEFAULT_SOFT_THRESHOLD = 0.85
const DEFAULT_CHAIN_DEPTH = 4

export interface LoadedUserConfig {
  config: RouterUserConfig
  /** Problems found in the files, shown in the scorecard notes. */
  notes: string[]
}

/** Read the global and project router.config.json. A bad file or value becomes a note, never a crash. */
export function loadUserConfig(projectDir?: string): LoadedUserConfig {
  const notes: string[] = []
  const global = readUserConfigFile(globalRouterConfigFile(), notes)
  const project = projectDir ? readUserConfigFile(projectRouterConfigFile(projectDir), notes) : {}
  return { config: mergeUserConfig(global, project), notes }
}

function readUserConfigFile(file: string, notes: string[]): RouterUserConfig {
  const result = readJsonFile(file)
  if (result.status === "absent") return {}
  if (result.status === "invalid") {
    notes.push(`${file} has a JSON error (${result.error}); it was ignored.`)
    return {}
  }
  if (!isPlainObject(result.value)) {
    notes.push(`${file} does not contain a JSON object; it was ignored.`)
    return {}
  }
  return sanitizeUserConfig(result.value, file, notes)
}

/** Remove values the router cannot use, with a note for each one. */
function sanitizeUserConfig(raw: Record<string, unknown>, file: string, notes: string[]): RouterUserConfig {
  const config = { ...raw }
  const drop = (key: string, rule: string) => {
    notes.push(`${file}: "${key}" ${rule}, not ${JSON.stringify(config[key])}; it was ignored.`)
    delete config[key]
  }

  if (config.plan !== undefined && !isPlan(config.plan)) drop("plan", `must be one of ${PLAN_PROFILES.join(" | ")}`)
  const depth = config.chainDepth
  if (depth !== undefined && !(typeof depth === "number" && Number.isInteger(depth) && depth >= 1)) {
    drop("chainDepth", "must be a whole number of 1 or more")
  }
  const threshold = config.softThreshold
  if (threshold !== undefined && !(typeof threshold === "number" && threshold > 0 && threshold <= 1)) {
    drop("softThreshold", "must be a number above 0 and at most 1")
  }
  for (const key of ["denyModels", "allowModels"]) {
    const list = config[key]
    if (list !== undefined && !(Array.isArray(list) && list.every((item) => typeof item === "string"))) {
      drop(key, "must be a list of model IDs")
    }
  }
  for (const key of ["roles", "weights"]) {
    const perRole = config[key]
    if (perRole === undefined) continue
    if (!isPlainObject(perRole)) {
      drop(key, "must be an object keyed by role")
      continue
    }
    const known: Record<string, unknown> = {}
    for (const [role, value] of Object.entries(perRole)) {
      if (isRoleName(role)) known[role] = value
      else notes.push(`${file}: unknown role "${role}" in "${key}"; it was ignored.`)
    }
    config[key] = known
  }
  return config as RouterUserConfig
}

/** Merge two `key -> object` maps one level deep, so project values add to global ones. */
function mergeByKey<K extends string, V extends object>(
  base: Partial<Record<K, V>> = {},
  override: Partial<Record<K, V>> = {},
): Partial<Record<K, V>> {
  const out: Partial<Record<K, V>> = { ...base }
  for (const key of Object.keys(override) as K[]) {
    out[key] = { ...base[key], ...override[key] } as V
  }
  return out
}

export function mergeUserConfig(base: RouterUserConfig, override: RouterUserConfig): RouterUserConfig {
  return {
    ...base,
    ...override,
    blend: { ...base.blend, ...override.blend },
    enduranceScale: { ...base.enduranceScale, ...override.enduranceScale },
    weights: mergeByKey(base.weights, override.weights),
    roles: mergeByKey(base.roles, override.roles),
    scores: mergeByKey(base.scores, override.scores),
    privacy: { ...base.privacy, ...override.privacy },
    feeds: { ...base.feeds, ...override.feeds },
    denyModels: override.denyModels ?? base.denyModels,
    allowModels: override.allowModels ?? base.allowModels,
  }
}

/** Detect the best-matching plan profile from the models actually available. */
export function detectPlan(catalog: CatalogModel[]): PlanProfile {
  const hasGo = catalog.some((m) => m.providerID === "opencode-go" && !m.free)
  if (hasGo) return "go"
  const hasFree = catalog.some((m) => m.free)
  if (hasFree) return "free"
  return "go"
}

export function resolveConfig(user: RouterUserConfig, catalog: CatalogModel[], cliPlan?: PlanProfile): ResolvedConfig {
  const plan = cliPlan ?? user.plan ?? detectPlan(catalog)
  return {
    ...user,
    plan,
    chainDepth: user.chainDepth ?? DEFAULT_CHAIN_DEPTH,
    softThreshold: user.softThreshold ?? DEFAULT_SOFT_THRESHOLD,
    blend: {
      input: user.blend?.input ?? 0.75,
      output: user.blend?.output ?? 0.25,
      cacheRead: user.blend?.cacheRead ?? 0.1,
    },
    enduranceScale: {
      minTokensPer5h: user.enduranceScale?.minTokensPer5h ?? 0.25,
      maxTokensPer5h: user.enduranceScale?.maxTokensPer5h ?? 40,
    },
    denyModels: user.denyModels ?? [],
    allowModels: user.allowModels ?? [],
    privacy: { freeModelsOk: user.privacy?.freeModelsOk ?? true },
  }
}
