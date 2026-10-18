import fs from "node:fs"
import path from "node:path"
import { beforeEach, describe, expect, it } from "vitest"
import { main } from "../src/cli.js"
import { LedgerStore } from "../src/ledger.js"
import { captureOutput, globalOpencodeDir, makeProject, readJsonFile, writeCatalog } from "./helpers.js"

let project = ""

beforeEach(() => {
  writeCatalog()
  project = makeProject()
  process.chdir(project)
})

function run(...argv: string[]) {
  return captureOutput(() => main(argv, project))
}

function writeProjectConfig(value: unknown): void {
  const file = path.join(project, ".opencode", "router.config.json")
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(value), "utf8")
}

describe("cli refresh", () => {
  it("reads the project router.config.json", async () => {
    writeProjectConfig({ plan: "free" })
    const { stdout } = await run("refresh", "--dry-run", "--json")
    expect(JSON.parse(stdout).table.plan).toBe("free")
  })

  it("rejects an unknown plan", async () => {
    const { result, stderr } = await run("refresh", "--plan", "gold", "--dry-run")
    expect(result).toBe(2)
    expect(stderr).toMatch(/go \| go-plus \| free/)
  })

  it("prints help for --help and writes nothing", async () => {
    const { result, stdout } = await run("refresh", "--help")
    expect(result).toBe(0)
    expect(stdout).toMatch(/Usage:/)
    expect(fs.existsSync(path.join(project, "opencode.json"))).toBe(false)
  })
})

describe("cli status", () => {
  it("reads the global ledger that the plugin writes", async () => {
    const { stdout: refreshed } = await run("refresh", "--dry-run", "--json")
    const buildId = JSON.parse(refreshed).table.active.build[0].id as string
    new LedgerStore(path.join(globalOpencodeDir(), "router", "ledger.json")).record(buildId, 5, 1000)

    const { stdout } = await run("status", "--json")
    expect(JSON.parse(stdout).usage[buildId].pct).toBeGreaterThan(0)
  })
})

describe("cli plan", () => {
  it("saves the plan and prints the rebuilt scorecard", async () => {
    const { result, stdout } = await run("plan", "free", "--scope", "global")
    expect(result).toBe(0)
    expect(readJsonFile(path.join(globalOpencodeDir(), "router.config.json")).plan).toBe("free")
    expect(stdout).toMatch(/Plan: \*\*free\*\*/)
  })

  it("warns when the project file overrides the global plan", async () => {
    writeProjectConfig({ plan: "go" })
    const { stdout, stderr } = await run("plan", "free", "--scope", "global")
    expect(stdout + stderr).toMatch(/overrides/)
  })
})

describe("cli eval", () => {
  it("writes the report to the router state folder, not the current folder", async () => {
    const { result } = await run("eval")
    expect(result).toBe(0)
    expect(fs.existsSync(path.join(globalOpencodeDir(), "router", "eval-report.md"))).toBe(true)
    expect(fs.existsSync(path.join(project, "evals"))).toBe(false)
  })
})
