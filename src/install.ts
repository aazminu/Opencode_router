import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { ensureDir, globalConfigDir, writeJson, homeDir } from "./paths.js"

function cliFilePath(): string {
  try {
    return fileURLToPath(new URL("./cli.js", import.meta.url)).replace(/\\/g, "/")
  } catch {
    return "opencode-router"
  }
}

function commandFile(description: string, args: string): string {
  const cli = cliFilePath()
  return [
    "---",
    `description: ${description}`,
    "agent: build",
    "---",
    "",
    "opencode-router already ran. Its output is between the markers below.",
    "",
    "Rules:",
    "1. Do not run any command, script, or tool. Do not search for opencode-router on PATH.",
    "2. Present the text between the markers to the user exactly as written.",
    "3. Do not summarize, reformat, shorten, or reorganize it.",
    "",
    "---BEGIN ROUTER OUTPUT---",
    `!\`node "${cli}" ${args} --scope global\``,
    "---END ROUTER OUTPUT---",
    "",
  ].join("\n")
}

const COMMANDS: Record<string, { description: string; args: string }> = {
  "refresh-routing": { description: "Recompute and apply OpenCode model routing", args: "refresh --plan=$1 --scope global" },
  "routing-status": { description: "Show the current routing table and quota use", args: "status" },
  "routing-plan": { description: "Switch the routing plan profile (go | go-plus | free)", args: "plan $1" },
  "routing-eval": { description: "Run the router scoring stress test", args: "eval" },
}

export interface InstallResult {
  commandDir: string
  configPath: string
  files: string[]
}

/** Write on-disk slash-command files plus a starter router.config.json. */
export function installCommands(scope: "global" | "project", dir: string = process.cwd()): InstallResult {
  const base = scope === "global" ? globalConfigDir() : path.join(dir, ".opencode")
  const commandDir = path.join(base, "command")
  ensureDir(commandDir)

  const files: string[] = []
  for (const [name, spec] of Object.entries(COMMANDS)) {
    const file = path.join(commandDir, `${name}.md`)
    fs.writeFileSync(file, commandFile(spec.description, spec.args), "utf8")
    files.push(file)
  }

  const configPath = path.join(base, "router.config.json")
  writeJson(configPath, {
    $comment: `opencode-router configuration. Home: ${homeDir()}`,
    plan: "go",
  })

  return { commandDir, configPath, files }
}
