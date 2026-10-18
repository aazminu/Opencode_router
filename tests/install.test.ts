import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { installCommands } from "../src/install.js"
import OpencodeRouter from "../src/index.js"
import { makeProject, stubInput, writeCatalog } from "./helpers.js"

describe("installCommands", () => {
  it("keeps an existing router.config.json", () => {
    const dir = makeProject()
    const file = path.join(dir, ".opencode", "router.config.json")
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const original = JSON.stringify({ plan: "free", denyModels: ["x"] })
    fs.writeFileSync(file, original, "utf8")

    installCommands("project", dir)

    expect(fs.readFileSync(file, "utf8")).toBe(original)
  })

  it("writes no home folder path into the starter config", () => {
    const result = installCommands("project", makeProject())
    const parsed = JSON.parse(fs.readFileSync(result.configPath, "utf8")) as Record<string, unknown>
    const withHome = Object.values(parsed).filter((v) => typeof v === "string" && v.includes(os.homedir()))
    expect(withHome).toEqual([])
  })

  it("passes --scope global only once in each command file", () => {
    const result = installCommands("project", makeProject())
    for (const file of result.files) {
      const text = fs.readFileSync(file, "utf8")
      expect(text.match(/--scope global/g)?.length ?? 0).toBeLessThanOrEqual(1)
    }
  })

  it("writes the same command body that the plugin registers", async () => {
    writeCatalog()
    const dir = makeProject()
    const hooks = await OpencodeRouter(stubInput(dir))
    const cfg: { command?: Record<string, { template: string }> } = {}
    await hooks.config!(cfg as never)

    const result = installCommands("project", dir)
    for (const file of result.files) {
      const name = path.basename(file, ".md")
      const body = fs.readFileSync(file, "utf8").split("---\n").slice(2).join("---\n").trim()
      expect(body).toBe(cfg.command![name]!.template.trim())
    }
  })
})
