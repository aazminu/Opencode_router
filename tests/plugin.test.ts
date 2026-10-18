import { describe, expect, it } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import OpencodeRouter from "../src/index.js"

function stubInput(dir: string) {
  return {
    client: { config: { update: async () => ({ data: {} }) } },
    project: { id: "p", worktree: dir, time: { created: 0 } },
    directory: dir,
    worktree: dir,
    experimental_workspace: { register() {} },
    serverUrl: new URL("http://127.0.0.1:0"),
    $: (async () => ({}) ) as unknown,
  } as never
}

describe("plugin", () => {
  it("registers commands and agent overrides in the config hook", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "router-plugin-"))
    try {
      const hooks = await OpencodeRouter(stubInput(dir))
      const cfg: Record<string, unknown> = {}
      await hooks.config!(cfg as never)

      const commands = cfg.command as Record<string, { template: string }>
      expect(Object.keys(commands)).toEqual(
        expect.arrayContaining(["refresh-routing", "routing-status", "routing-plan", "routing-eval"]),
      )
      expect(commands["refresh-routing"]!.template).toMatch(/!\`node "/)
      expect(cfg.agent).toBeDefined()
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
