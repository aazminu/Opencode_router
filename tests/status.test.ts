import path from "node:path"
import { describe, expect, it } from "vitest"
import { buildRoutingTable, statusRows } from "../src/engine.js"
import { LedgerStore } from "../src/ledger.js"
import { emptyFeedScores } from "../src/scoring.js"
import { routedCatalog } from "./helpers.js"

describe("statusRows", () => {
  it("shows the failover model when the first model is not healthy", async () => {
    const result = await buildRoutingTable({ catalog: routedCatalog(), plan: "go", feeds: emptyFeedScores() })
    const chain = result.table.active.build!
    const ledger = new LedgerStore(path.join(process.env.XDG_CONFIG_HOME!, "ledger.json"))
    ledger.cooldown(chain[0]!.id, 60_000, "test")

    const row = statusRows(result, ledger).find((r) => r.role === "build")!

    expect(row.entry?.id).toBe(chain[1]!.id)
    expect(row.state).toBe("failover")
  })
})
