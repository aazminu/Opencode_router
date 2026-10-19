import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, vi } from "vitest"

// Every test gets its own config and cache folders, so no test can read the
// real OpenCode catalog or write to the real ~/.config/opencode.
let root = ""
const startDir = process.cwd()

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "router-test-"))
  process.env.XDG_CONFIG_HOME = path.join(root, "config")
  process.env.XDG_CACHE_HOME = path.join(root, "cache")
  delete process.env.OPENCODE_SERVER_URL
  delete process.env.OPENCODE_SERVER
  delete process.env.OPENCODE_API_KEY
  // No test may reach the network. A test that needs npm stubs fetch itself.
  vi.stubGlobal("fetch", async () => {
    throw new Error("the network is off in tests")
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  process.chdir(startDir)
  process.exitCode = undefined
  fs.rmSync(root, { recursive: true, force: true })
})
