import type { CatalogModel } from "../src/types.js"

export function model(partial: Partial<CatalogModel> & { providerID: string; modelID: string }): CatalogModel {
  const { providerID, modelID } = partial
  return {
    providerID,
    modelID,
    id: `${providerID}/${modelID}`,
    name: partial.name ?? modelID,
    family: partial.family,
    reasoning: partial.reasoning ?? true,
    toolCall: partial.toolCall ?? true,
    attachment: partial.attachment ?? false,
    openWeights: partial.openWeights ?? true,
    limit: partial.limit ?? { context: 200000, output: 32000 },
    cost: partial.cost ?? { input: 0.1, output: 0.5, cacheRead: 0 },
    tiers: partial.tiers ?? [],
    inputModalities: partial.inputModalities ?? ["text"],
    free: partial.free ?? false,
  }
}

export const sampleCatalog: CatalogModel[] = [
  model({
    providerID: "opencode-go",
    modelID: "smart-big",
    family: "smart",
    limit: { context: 1000000, output: 128000 },
    cost: { input: 4, output: 20, cacheRead: 0 },
  }),
  model({
    providerID: "opencode-go",
    modelID: "workhorse",
    family: "wh",
    limit: { context: 1000000, output: 384000 },
    cost: { input: 0.15, output: 0.6, cacheRead: 0.003 },
  }),
  model({
    providerID: "opencode",
    modelID: "free-fast",
    family: "ff",
    cost: { input: 0, output: 0, cacheRead: 0 },
    free: true,
  }),
  model({
    providerID: "opencode",
    modelID: "zen-paid",
    family: "zp",
    cost: { input: 2, output: 6, cacheRead: 0.25 },
  }),
  model({
    providerID: "opencode-go",
    modelID: "no-tool",
    family: "nt",
    toolCall: false,
  }),
  model({
    providerID: "opencode-go",
    modelID: "tiny-context",
    family: "tc",
    limit: { context: 8000, output: 2000 },
  }),
]
