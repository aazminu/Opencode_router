import os from "node:os"
import { describe, expect, it } from "vitest"
import { globToRegex, matchesAny } from "../src/rank.js"
import { globalConfigDir, parseJsonc } from "../src/paths.js"

describe("globToRegex", () => {
  it("matches wildcards and dots", () => {
    expect(globToRegex("*-free").test("opencode/glm-5.3-flash-free")).toBe(true)
    expect(globToRegex("opencode-go/*").test("opencode-go/glm-5.2")).toBe(true)
    expect(globToRegex("opencode-go/*").test("opencode/glm-5.2")).toBe(false)
    expect(matchesAny("opencode-go/kimi-k3", ["*-k3", "x"])).toBe(true)
  })
})

describe("parseJsonc", () => {
  it("removes line comments, block comments, and trailing commas", () => {
    const input = `{
      // a comment
      "a": 1,
      /* block */
      "b": [1, 2,],
    }`
    expect(parseJsonc(input).value).toEqual({ a: 1, b: [1, 2] })
  })

  it("keeps // inside strings", () => {
    expect(parseJsonc(`{ "url": "https://example.com//x" }`).value).toEqual({ url: "https://example.com//x" })
  })

  it("keeps ',}' inside strings", () => {
    expect(parseJsonc(`{ "a": "x,}" }`).value).toEqual({ a: "x,}" })
  })

  it("reports the line of a JSON error", () => {
    expect(parseJsonc(`{\n  "a": 1,\n  "b": }`).error).toMatch(/line 3/)
  })
})

describe("test isolation", () => {
  it("uses a temporary config folder", () => {
    expect(globalConfigDir().startsWith(os.tmpdir())).toBe(true)
  })
})
