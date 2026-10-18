import { describe, expect, it } from "vitest"
import { captureOutput } from "./helpers.js"

describe("cli module", () => {
  it("does not run the CLI when the module is imported", async () => {
    const { stdout, stderr } = await captureOutput(() => import("../src/cli.js"))
    expect(stdout + stderr).toBe("")
    expect(process.exitCode).toBeUndefined()
  })
})
