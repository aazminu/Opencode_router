import { afterEach, describe, expect, it } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { LedgerStore } from "../src/ledger.js"

const files: string[] = []

function tmpFile(): string {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "router-")), "ledger.json")
  files.push(path.dirname(file))
  return file
}

afterEach(() => {
  for (const dir of files.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

describe("LedgerStore", () => {
  it("tracks spend and computes 5h percentage against a 20% cap", () => {
    let now = 1_000_000
    const store = new LedgerStore(tmpFile(), () => now)
    store.record("opencode-go/x", 3, 1_000_000)
    const u = store.usage("opencode-go/x", 15)
    // cap 15 -> 5h cap 3 -> 100%
    expect(u.pct5h).toBeCloseTo(1, 5)
    expect(u.pctMonth).toBeCloseTo(0.2, 5)
  })

  it("marks a model unhealthy once past the soft threshold", () => {
    const now = 1_000_000
    const store = new LedgerStore(tmpFile(), () => now)
    store.record("opencode-go/x", 2.7, 1)
    expect(store.isHealthy("opencode-go/x", 15, 0.85)).toBe(false)
    expect(store.isHealthy("opencode-go/x", 80, 0.85)).toBe(true)
  })

  it("rolls the 5h window but keeps the monthly bucket", () => {
    let now = 1_000_000
    const store = new LedgerStore(tmpFile(), () => now)
    store.record("opencode-go/x", 5, 10)
    now += 6 * 60 * 60 * 1000
    const u = store.usage("opencode-go/x", 80)
    expect(u.cost5h).toBe(0)
    expect(u.costMonth).toBeCloseTo(5, 5)
  })

  it("applies and clears cooldowns", () => {
    let now = 1_000_000
    const store = new LedgerStore(tmpFile(), () => now)
    store.cooldown("opencode-go/x", 60_000, "rate limit")
    expect(store.isHealthy("opencode-go/x", 80, 0.85)).toBe(false)
    now += 61_000
    expect(store.isHealthy("opencode-go/x", 80, 0.85)).toBe(true)
  })

  it("persists across instances", () => {
    const file = tmpFile()
    let now = 1_000_000
    new LedgerStore(file, () => now).record("opencode-go/x", 1, 100)
    const reopened = new LedgerStore(file, () => now)
    expect(reopened.usage("opencode-go/x", 80).cost5h).toBeCloseTo(1, 5)
  })

  it("keeps the records of two stores that share one file", () => {
    const file = tmpFile()
    const now = 1_000_000
    const first = new LedgerStore(file, () => now)
    const second = new LedgerStore(file, () => now)
    first.record("opencode-go/x", 1, 10)
    second.record("opencode-go/x", 2, 20)
    expect(new LedgerStore(file, () => now).usage("opencode-go/x", 80).cost5h).toBeCloseTo(3, 5)
  })

  it("keeps a copy of a corrupt ledger file", () => {
    const file = tmpFile()
    fs.writeFileSync(file, "{ not json", "utf8")
    new LedgerStore(file, () => 1_000_000).record("opencode-go/x", 1, 10)
    const copies = fs.readdirSync(path.dirname(file)).filter((name) => name.startsWith("ledger.json.corrupt"))
    expect(copies).toHaveLength(1)
  })
})
