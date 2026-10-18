import type { CatalogModel, PlanProfile, ResolvedConfig, RouterUserConfig } from "./types.js"
import { globalRouterConfigFile, projectRouterConfigFile, readJson } from "./paths.js"

const DEFAULT_SOFT_THRESHOLD = 0.85
const DEFAULT_CHAIN_DEPTH = 4

export function loadUserConfig(projectDir?: string): RouterUserConfig {
  const global = readJson<RouterUserConfig>(globalRouterConfigFile()) ?? {}
  const project = projectDir ? readJson<RouterUserConfig>(projectRouterConfigFile(projectDir)) ?? {} : {}
  return mergeUserConfig(global, project)
}

export function mergeUserConfig(base: RouterUserConfig, override: RouterUserConfig): RouterUserConfig {
  return {
    ...base,
    ...override,
    blend: { ...base.blend, ...override.blend } as RouterUserConfig["blend"],
    enduranceScale: { ...base.enduranceScale, ...override.enduranceScale } as RouterUserConfig["enduranceScale"],
    weights: { ...base.weights, ...override.weights },
    roles: { ...base.roles, ...override.roles },
    scores: { ...base.scores, ...override.scores },
    privacy: { ...base.privacy, ...override.privacy },
    budget: { ...base.budget, ...override.budget },
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
    scope: user.scope ?? "project",
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
