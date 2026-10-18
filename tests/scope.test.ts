import { describe, expect, it } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { resolveScope } from "../src/cli.js"

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "router-scope-"))
}

describe("resolveScope", () => {
  it("uses the explicit scope when given", () => {
    const dir = tmp()
    expect(resolveScope(true, "project", dir)).toBe("project")
    expect(resolveScope(true, "global", dir)).toBe("global")
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it("falls back to global when the directory is not a project", () => {
    const dir = tmp()
    expect(resolveScope(false, "project", dir)).toBe("global")
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it("falls back to project when the directory has markers", () => {
    const dir = tmp()
    fs.mkdirSync(path.join(dir, ".git"))
    expect(resolveScope(false, "project", dir)).toBe("project")
    fs.rmSync(dir, { recursive: true, force: true })
  })
})
