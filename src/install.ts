import fs from "node:fs"
import path from "node:path"
import type { ConfigScope } from "./types.js"
import { SLASH_COMMANDS, commandTemplate, type SlashCommand } from "./commands.js"
import { ensureDir, fileExists, globalConfigDir, writeJson } from "./paths.js"

function commandFile(command: SlashCommand): string {
  return ["---", `description: ${command.description}`, "agent: build", "---", "", commandTemplate(command.args), ""].join("\n")
}

export interface InstallResult {
  commandDir: string
  configPath: string
  /** False when a router.config.json already existed; it is never replaced. */
  configCreated: boolean
  files: string[]
}

/** Write on-disk slash-command files, plus an empty router.config.json when there is none. */
export function installCommands(scope: ConfigScope, dir: string): InstallResult {
  const base = scope === "global" ? globalConfigDir() : path.join(dir, ".opencode")
  const commandDir = path.join(base, "command")
  ensureDir(commandDir)

  const files = SLASH_COMMANDS.map((command) => {
    const file = path.join(commandDir, `${command.name}.md`)
    fs.writeFileSync(file, commandFile(command), "utf8")
    return file
  })

  const configPath = path.join(base, "router.config.json")
  const configCreated = !fileExists(configPath)
  if (configCreated) writeJson(configPath, {})

  return { commandDir, configPath, configCreated, files }
}
