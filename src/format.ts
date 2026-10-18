import type { RankingEntry, RoutingTable } from "./types.js"

const ROLE_ORDER = [
  "plan",
  "build",
  "general",
  "explore",
  "small_model",
  "title",
  "summary",
  "compaction",
]

function fmtTokens(value: number | null): string {
  if (value === null) return "unlimited"
  if (value >= 1) return `${value.toFixed(1)}M`
  return `${(value * 1000).toFixed(0)}K`
}

function fmtCap(value: number | null): string {
  return value === null ? "inf" : `$${value}`
}

function classTag(entry: RankingEntry): string {
  if (entry.class === "free") return "free*"
  if (entry.class === "subscription") return "go"
  return "paid"
}

export function formatScorecard(table: RoutingTable, opts: { verbose?: boolean } = {}): string {
  const lines: string[] = []
  const when = table.createdAt.replace("T", " ").replace(/\..*$/, "")
  lines.push(`## opencode-router scorecard`)
  lines.push("")
  lines.push(`- Plan: **${table.plan}**`)
  lines.push(`- Updated: ${when} (UTC)`)
  lines.push(`- Legend: go = Go subscription, free* = $0 (data may be collected), paid = Zen pay-as-you-go`)
  lines.push("")
  lines.push("| Role | # | Model | Var | Score | Intel | Speed | Endur | Tokens/5h | Cap/mo | Class |")
  lines.push("| :-- | --: | :-- | :-- | --: | --: | --: | --: | --: | --: | :-- |")

  const roles = Object.keys(table.active).sort((a, b) => {
    const ia = ROLE_ORDER.indexOf(a)
    const ib = ROLE_ORDER.indexOf(b)
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
  })

  for (const role of roles) {
    const chain = table.active[role] ?? []
    if (chain.length === 0) {
      lines.push(`| ${role} | - | _no eligible model_ | | | | | | | | |`)
      continue
    }
    chain.forEach((entry, index) => {
      const roleCol = index === 0 ? role : ""
      const sources = opts.verbose
        ? ` (${entry.sources.intelligence}/${entry.sources.speed}/${entry.sources.endurance})`
        : ""
      lines.push(
        `| ${roleCol} | ${entry.rank} | \`${entry.id}\`${sources} | ${entry.variant ?? "-"} | ${entry.score} | ${entry.intelligence} | ${entry.speed} | ${entry.endurance} | ${fmtTokens(entry.tokensPer5h)} | ${fmtCap(entry.monthlyCapUSD)} | ${classTag(entry)} |`,
      )
    })
  }

  if (table.notes.length > 0) {
    lines.push("")
    lines.push("**Notes**")
    for (const note of table.notes) lines.push(`- ${note}`)
  }

  lines.push("")
  lines.push(`_Sources: override = committed/user table, feed = external benchmark, cap = computed from quota, heuristic = pattern rules._`)
  return lines.join("\n")
}

export function formatStatus(table: RoutingTable, usage: Record<string, { pct: number; label: string }>): string {
  const lines: string[] = []
  lines.push(`## opencode-router status`)
  lines.push("")
  lines.push(`- Plan: **${table.plan}**`)
  lines.push("")
  lines.push("| Role | Active model | Rank | Usage (5h) | State |")
  lines.push("| :-- | :-- | --: | --: | :-- |")
  for (const [role, chain] of Object.entries(table.active)) {
    const active = chain[0]
    if (!active) {
      lines.push(`| ${role} | _none_ | - | - | - |`)
      continue
    }
    const u = usage[active.id]
    const usageText = u ? `${u.pct.toFixed(0)}%` : "-"
    const state = u && u.pct >= 85 ? "throttled" : "healthy"
    lines.push(`| ${role} | \`${active.id}\` | ${active.rank} | ${usageText} | ${state} |`)
  }
  return lines.join("\n")
}
