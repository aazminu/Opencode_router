import fs from "node:fs"
import path from "node:path"
import { describe, expect, it, vi } from "vitest"
import OpencodeRouter from "../src/index.js"
import { globalOpencodeDir, makeProject, readJsonFile, stubInput, stubRegistry, writeCatalog } from "./helpers.js"

interface LedgerFile {
  models: Record<string, { cooldownUntil?: number }>
}

function ledgerFile(): string {
  return path.join(globalOpencodeDir(), "router", "ledger.json")
}

describe("plugin config hook", () => {
  it("registers commands and agent overrides", async () => {
    writeCatalog()
    const hooks = await OpencodeRouter(stubInput(makeProject()))
    const cfg: Record<string, unknown> = {}
    await hooks.config!(cfg as never)

    const commands = cfg.command as Record<string, { template: string }>
    expect(Object.keys(commands)).toEqual(
      expect.arrayContaining(["refresh-routing", "routing-status", "routing-plan", "routing-eval"]),
    )
    expect(commands["refresh-routing"]!.template).toMatch(/!\`node "/)
    expect(cfg.agent).toBeDefined()
  })

  it("keeps the user's other agent settings", async () => {
    writeCatalog()
    const hooks = await OpencodeRouter(stubInput(makeProject()))
    const cfg = { agent: { build: { prompt: "Be brief.", model: "old/model" } } }
    await hooks.config!(cfg as never)

    expect(cfg.agent.build.prompt).toBe("Be brief.")
    expect(cfg.agent.build.model).not.toBe("old/model")
  })
})

describe("plugin commands", () => {
  it("applies the plan given to /routing-plan", async () => {
    writeCatalog()
    const updates: unknown[] = []
    const hooks = await OpencodeRouter(stubInput(makeProject(), updates))

    await hooks["command.execute.before"]!({ command: "routing-plan", sessionID: "s1", arguments: "go-plus" }, { parts: [] })

    const saved = readJsonFile<{ plan: string }>(path.join(globalOpencodeDir(), "router", "routing-table.json"))
    expect(saved.plan).toBe("go-plus")
    expect(updates).toHaveLength(1)
  })

  it("keeps the small model on the message of a router slash command", async () => {
    writeCatalog()
    const hooks = await OpencodeRouter(stubInput(makeProject()))
    const cfg: Record<string, unknown> = {}
    await hooks.config!(cfg as never)
    const command = (cfg.command as Record<string, { model: string; template: string }>)["routing-status"]!
    const slash = command.model.indexOf("/")
    const small = { providerID: command.model.slice(0, slash), modelID: command.model.slice(slash + 1) }
    const output = {
      message: { agent: "build", model: { ...small } },
      parts: [{ type: "text", text: command.template }],
    }

    await hooks["chat.message"]!({ sessionID: "s1", agent: "build", model: small }, output as never)

    expect(output.message.model).toEqual(small)
  })
})

describe("plugin update notice", () => {
  it("shows one toast when npm has a newer version", async () => {
    writeCatalog()
    stubRegistry("99.0.0")
    const toasts: unknown[] = []
    const hooks = await OpencodeRouter(stubInput(makeProject(), [], toasts))

    await hooks.event!({ event: { type: "session.created", properties: { info: { id: "s1" } } } } as never)
    await hooks.event!({ event: { type: "session.created", properties: { info: { id: "s2" } } } } as never)

    await vi.waitFor(() => expect(toasts).toHaveLength(1))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(toasts).toHaveLength(1)
    expect(JSON.stringify(toasts[0])).toContain("99.0.0")
  })
})

describe("plugin failover", () => {
  it("cools down only the model of the session that hit a rate limit", async () => {
    writeCatalog()
    const hooks = await OpencodeRouter(stubInput(makeProject()))
    const output: { message: { agent: string; model?: { providerID: string; modelID: string } }; parts: [] } = {
      message: { agent: "build" },
      parts: [],
    }
    await hooks["chat.message"]!({ sessionID: "s1", agent: "build" }, output as never)
    const used = `${output.message.model!.providerID}/${output.message.model!.modelID}`

    await hooks.event!({
      event: { type: "session.error", properties: { sessionID: "s1", error: { name: "APIError", data: { statusCode: 429 } } } },
    } as never)

    const ledger = readJsonFile<LedgerFile>(ledgerFile())
    const cooled = Object.entries(ledger.models)
      .filter(([, state]) => state.cooldownUntil)
      .map(([id]) => id)
    expect(cooled).toEqual([used])
  })

  it("does not cool down a model after a plain bad-request error", async () => {
    writeCatalog()
    const hooks = await OpencodeRouter(stubInput(makeProject()))

    await hooks.event!({
      event: {
        type: "message.updated",
        properties: {
          info: {
            id: "m1",
            sessionID: "s1",
            role: "assistant",
            providerID: "opencode-go",
            modelID: "glm-5.3-flash",
            time: { created: 1, completed: 2 },
            tokens: { input: 10, output: 10, cache: { read: 0, write: 0 } },
            cost: 0,
            error: { name: "APIError", data: { statusCode: 400, message: "context length exceeded" } },
          },
        },
      },
    } as never)

    expect(fs.existsSync(ledgerFile())).toBe(true)
    const ledger = readJsonFile<LedgerFile>(ledgerFile())
    expect(ledger.models["opencode-go/glm-5.3-flash"]?.cooldownUntil).toBeUndefined()
  })
})
