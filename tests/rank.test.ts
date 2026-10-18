import { describe, expect, it } from "vitest"
import { rankRole } from "../src/rank.js"
import { resolveConfig } from "../src/config.js"
import { loadDefaultTable } from "../src/score-table.js"
import { emptyFeedScores } from "../src/scoring.js"
import { model, sampleCatalog } from "./helpers.js"
import type { CatalogModel, PlanProfile } from "../src/types.js"

function table() {
  const t = loadDefaultTable()
  for (const id of ["opencode-go/smart-big", "opencode-go/workhorse", "opencode-go/no-tool", "opencode-go/tiny-context"]) {
    t.monthlyCaps[id] = { go: 60, goPlus: 120 }
  }
  return t
}

function cfgFor(plan: PlanProfile) {
  return resolveConfig({ plan }, sampleCatalog, plan)
}

describe("rankRole", () => {
  it("excludes Zen-paid models on the go plan", () => {
    const chain = rankRole(sampleCatalog, "build", table(), cfgFor("go"), emptyFeedScores())
    expect(chain.some((e) => e.id === "opencode/zen-paid")).toBe(false)
  })

  it("on the free plan only uses the Zen $0 tier", () => {
    const chain = rankRole(sampleCatalog, "build", table(), cfgFor("free"), emptyFeedScores())
    expect(chain.length).toBeGreaterThan(0)
    expect(chain.every((e) => e.id.startsWith("opencode/") && e.class === "free")).toBe(true)
  })

  it("honors toolCall and minContext requirements", () => {
    const chain = rankRole(sampleCatalog, "build", table(), cfgFor("go"), emptyFeedScores())
    expect(chain.some((e) => e.modelID === "no-tool")).toBe(false)
    expect(chain.some((e) => e.modelID === "tiny-context")).toBe(false)
  })

  it("puts subscription models ahead of free ones for a builder role (go plan)", () => {
    const chain = rankRole(sampleCatalog, "build", table(), cfgFor("go"), emptyFeedScores())
    expect(chain[0]?.class).toBe("subscription")
  })

  it("respects chain depth", () => {
    const t = table()
    t.roles.build = { ...t.roles.build!, chainDepth: 2 }
    const chain = rankRole(sampleCatalog, "build", t, cfgFor("go"), emptyFeedScores())
    expect(chain.length).toBeLessThanOrEqual(2)
  })

  it("denylist removes a model", () => {
    const chain = rankRole(
      sampleCatalog,
      "build",
      table(),
      { ...cfgFor("go"), denyModels: ["opencode-go/workhorse"] },
      emptyFeedScores(),
    )
    expect(chain.some((e) => e.id === "opencode-go/workhorse")).toBe(false)
  })

  it("privacy=false removes free models from real-work roles only", () => {
    const cfg = { ...cfgFor("go"), privacy: { freeModelsOk: false } }
    const build = rankRole(sampleCatalog, "build", table(), cfg, emptyFeedScores())
    expect(build.some((e) => e.class === "free")).toBe(false)

    const explore = rankRole(sampleCatalog, "explore", table(), cfg, emptyFeedScores())
    expect(explore.length).toBeGreaterThan(0)
  })
})

describe("rank robustness", () => {
  it("handles an empty catalog", () => {
    const chain = rankRole([] as CatalogModel[], "build", table(), cfgFor("go"), emptyFeedScores())
    expect(chain).toEqual([])
  })

  it("keeps family diversity when asked", () => {
    const catalog: CatalogModel[] = [
      model({ providerID: "opencode-go", modelID: "alpha-1", family: "alpha", cost: { input: 0.1, output: 0.5 } }),
      model({ providerID: "opencode-go", modelID: "alpha-2", family: "alpha", cost: { input: 0.1, output: 0.5 } }),
      model({ providerID: "opencode-go", modelID: "beta-1", family: "beta", cost: { input: 0.1, output: 0.5 } }),
    ]
    const t = table()
    for (const m of catalog) t.monthlyCaps[m.id] = { go: 60, goPlus: 120 }
    const chain = rankRole(catalog, "build", t, cfgFor("go"), emptyFeedScores())
    const families = chain.map((e) => catalog.find((c) => c.id === e.id)?.family)
    expect(new Set(families).size).toBe(families.length)
  })
})
