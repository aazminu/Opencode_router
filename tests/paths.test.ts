import { describe, expect, it } from "vitest"
import { globToRegex, matchesAny } from "../src/rank.js"
import { stripJsonComments } from "../src/paths.js"

describe("globToRegex", () => {
  it("matches wildcards and dots", () => {
    expect(globToRegex("*-free").test("opencode/glm-5.3-flash-free")).toBe(true)
    expect(globToRegex("opencode-go/*").test("opencode-go/glm-5.2")).toBe(true)
    expect(globToRegex("opencode-go/*").test("opencode/glm-5.2")).toBe(false)
    expect(matchesAny("opencode-go/kimi-k3", ["*-k3", "x"])).toBe(true)
  })
})

describe("stripJsonComments", () => {
  it("removes line, block comments and trailing commas", () => {
    const input = `{
      // a comment
      "a": 1,
      /* block */
      "b": [1, 2,],
    }`
    const parsed = JSON.parse(stripJsonComments(input)) as { a: number; b: number[] }
    expect(parsed.a).toBe(1)
    expect(parsed.b).toEqual([1, 2])
  })

  it("keeps // inside strings", () => {
    const input = `{ "url": "https://example.com//x" }`
    const parsed = JSON.parse(stripJsonComments(input)) as { url: string }
    expect(parsed.url).toBe("https://example.com//x")
  })
})
