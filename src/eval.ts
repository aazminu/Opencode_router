import type { PlanProfile, RankingEntry } from "./types.js"
import { buildRoutingTable } from "./engine.js"
import { writeTextAtomic } from "./paths.js"
import { FIVE_HOUR_SHARE } from "./scoring.js"
import { evalReportFile } from "./state.js"

export interface EvalOptions {
  plan?: PlanProfile
  catalog?: string
  json?: boolean
  projectDir?: string
}

const ROLE = "build"
const CHAIN_LIMIT = 4

const PROMPT = `In a fixture repo, build a CLI named \`todo\` with \`add\`, \`list\`, \`done <id>\`, and \`rm <id>\` subcommands backed by a JSON file. Include input validation, a \`--json\` output flag, and a test suite. Then fix any failing tests.`

const GO_URL = "https://opencode.ai/inference/go/openai/v1"
const ZEN_URL = "https://opencode.ai/inference/openai/v1"

interface CallResult {
  ok: boolean
  latencyMs: number
  inputTokens: number
  outputTokens: number
  costUSD: number
  text: string
  error?: string
}

function staticGrade(text: string): { passed: number; checks: Record<string, boolean> } {
  const lower = text.toLowerCase()
  const checks: Record<string, boolean> = {
    add: /\badd\b/.test(lower),
    list: /\blist\b/.test(lower),
    done: /\bdone\b/.test(lower),
    rm: /\brm\b|\bremove\b|\bdelete\b/.test(lower),
    jsonFlag: /--json/.test(text),
    validation: /invalid|validat|error/.test(lower),
    tests: /\btest\b|\bdescribe\(|\bit\(|assert/.test(lower),
  }
  const passed = Object.values(checks).filter(Boolean).length
  return { passed, checks }
}

async function callModel(entry: RankingEntry, apiKey: string): Promise<CallResult> {
  const base = entry.providerID === "opencode-go" ? GO_URL : ZEN_URL
  const started = Date.now()
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: entry.modelID,
        messages: [{ role: "user", content: PROMPT }],
        max_tokens: 2000,
      }),
    })
    const latencyMs = Date.now() - started
    if (!res.ok) {
      return { ok: false, latencyMs, inputTokens: 0, outputTokens: 0, costUSD: 0, text: "", error: `HTTP ${res.status}` }
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>
      usage?: { prompt_tokens?: number; completion_tokens?: number }
    }
    const text = json.choices?.[0]?.message?.content ?? ""
    return {
      ok: true,
      latencyMs,
      inputTokens: json.usage?.prompt_tokens ?? 0,
      outputTokens: json.usage?.completion_tokens ?? 0,
      costUSD: estimateCost(entry, json.usage?.prompt_tokens ?? 0, json.usage?.completion_tokens ?? 0),
      text,
    }
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      inputTokens: 0,
      outputTokens: 0,
      costUSD: 0,
      text: "",
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

function estimateCost(entry: RankingEntry, inputTokens: number, outputTokens: number): number {
  // Rough: derived from the score table's blended cost when present.
  const per1M = entry.tokensPer5h && entry.monthlyCapUSD ? (entry.monthlyCapUSD * FIVE_HOUR_SHARE) / entry.tokensPer5h : 1
  return ((inputTokens + outputTokens) / 1_000_000) * per1M
}

export async function runEval(opts: EvalOptions = {}): Promise<number> {
  const { table } = await buildRoutingTable({ plan: opts.plan, catalogFile: opts.catalog, projectDir: opts.projectDir })
  const chain = (table.active[ROLE] ?? []).slice(0, CHAIN_LIMIT)

  if (chain.length === 0) {
    process.stderr.write(`error: no candidate models for role "${ROLE}"\n`)
    return 1
  }

  const apiKey = process.env.OPENCODE_API_KEY
  const reportPath = evalReportFile()

  const lines: string[] = []
  lines.push(`# opencode-router eval report`)
  lines.push("")
  lines.push(`- Role: **${ROLE}**`)
  lines.push(`- Plan: **${table.plan}**`)
  lines.push(`- Generated: ${new Date().toISOString()}`)
  lines.push("")
  lines.push(`## Prompt`)
  lines.push("")
  lines.push("> " + PROMPT.replace(/\r?\n/g, " "))
  lines.push("")

  if (!apiKey) {
    lines.push("## Result")
    lines.push("")
    lines.push("`OPENCODE_API_KEY` is not set. Nothing was called. The predicted ranking is below.")
    lines.push("")
    lines.push("| Rank | Model | Score | Intel | Speed | Endur | Tokens/5h | Class |")
    lines.push("| --: | :-- | --: | --: | --: | --: | --: | :-- |")
    for (const e of chain) {
      lines.push(`| ${e.rank} | \`${e.id}\` | ${e.score} | ${e.intelligence} | ${e.speed} | ${e.endurance} | ${e.tokensPer5h ?? "inf"} | ${e.class} |`)
    }
    lines.push("")
    lines.push("Set `OPENCODE_API_KEY` and re-run `opencode-router eval` to measure real latency, tokens, and pass rate.")
    writeTextAtomic(reportPath, lines.join("\n") + "\n")
    if (opts.json) process.stdout.write(JSON.stringify({ role: ROLE, predicted: chain }, null, 2) + "\n")
    else process.stdout.write(`Wrote ${reportPath} (predicted only; set OPENCODE_API_KEY for live results)\n`)
    return 0
  }

  lines.push("## Result")
  lines.push("")
  lines.push("| Predicted rank | Model | Latency (ms) | Tokens | Cost (USD) | Checks | Static pass | Error |")
  lines.push("| --: | :-- | --: | --: | --: | --: | --: | :-- |")

  const results: Array<{ entry: RankingEntry; result: CallResult; pass: number }> = []
  for (const entry of chain) {
    const result = await callModel(entry, apiKey)
    const grade = staticGrade(result.text)
    results.push({ entry, result, pass: grade.passed })
    lines.push(
      `| ${entry.rank} | \`${entry.id}\` | ${result.latencyMs} | ${result.inputTokens + result.outputTokens} | ${result.costUSD.toFixed(5)} | ${grade.passed}/7 | ${result.ok ? (grade.passed >= 5 ? "PASS" : "WEAK") : "FAIL"} | ${result.error ?? ""} |`,
    )
  }

  const measured = [...results].sort((a, b) => b.pass - a.pass || a.result.latencyMs - b.result.latencyMs)
  lines.push("")
  lines.push("## Predicted vs measured")
  lines.push("")
  lines.push("| Predicted rank | Measured rank | Model |")
  lines.push("| --: | --: | :-- |")
  for (const { entry } of results) {
    const measuredRank = measured.findIndex((m) => m.entry.id === entry.id) + 1
    lines.push(`| ${entry.rank} | ${measuredRank} | \`${entry.id}\` |`)
  }
  lines.push("")
  lines.push("Feed the measured ranks back into `model-scores.json` (or `router.config.json` -> `scores`) to tune accuracy.")

  writeTextAtomic(reportPath, lines.join("\n") + "\n")
  if (opts.json) process.stdout.write(JSON.stringify({ role: ROLE, results }, null, 2) + "\n")
  else process.stdout.write(`Wrote ${reportPath}\n`)
  return 0
}
