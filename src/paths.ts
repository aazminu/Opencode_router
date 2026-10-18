import os from "node:os"
import path from "node:path"
import fs from "node:fs"

export function homeDir(): string {
  return os.homedir()
}

/** Global OpenCode config directory. Honors XDG_CONFIG_HOME like OpenCode does. */
export function globalConfigDir(): string {
  const xdg = process.env.XDG_CONFIG_HOME
  const base = xdg && xdg.length > 0 ? xdg : path.join(homeDir(), ".config")
  return path.join(base, "opencode")
}

/** OpenCode model catalog cache written by the OpenCode CLI/desktop. */
export function catalogCacheFile(): string {
  const xdg = process.env.XDG_CACHE_HOME
  const base = xdg && xdg.length > 0 ? xdg : path.join(homeDir(), ".cache")
  return path.join(base, "opencode", "models.json")
}

export function globalRouterConfigFile(): string {
  return path.join(globalConfigDir(), "router.config.json")
}

export function globalStateDir(): string {
  return path.join(globalConfigDir(), "router")
}

export function cwd(): string {
  return process.cwd()
}

export function projectRouterConfigFile(dir: string = cwd()): string {
  return path.join(dir, ".opencode", "router.config.json")
}

export function projectStateDir(dir: string = cwd()): string {
  return path.join(dir, ".opencode", "state")
}

/** Candidate opencode.json paths, most specific first. */
export function opencodeConfigCandidates(dir: string = cwd()): string[] {
  const out: string[] = []
  out.push(path.join(dir, ".opencode", "opencode.json"))
  out.push(path.join(dir, "opencode.jsonc"))
  out.push(path.join(dir, "opencode.json"))
  return out
}

export function globalOpencodeConfigCandidates(): string[] {
  return [path.join(globalConfigDir(), "opencode.jsonc"), path.join(globalConfigDir(), "opencode.json")]
}

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true })
}

export function readJson<T = unknown>(file: string): T | undefined {
  try {
    const raw = fs.readFileSync(file, "utf8")
    return JSON.parse(stripJsonComments(raw)) as T
  } catch {
    return undefined
  }
}

export function writeJson(file: string, value: unknown): void {
  ensureDir(path.dirname(file))
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n", "utf8")
}

export function fileExists(file: string): boolean {
  try {
    return fs.statSync(file).isFile()
  } catch {
    return false
  }
}

export function pathExists(file: string): boolean {
  try {
    return fs.statSync(file) !== undefined
  } catch {
    return false
  }
}

const PROJECT_MARKERS = [
  ".git",
  "package.json",
  "opencode.json",
  "opencode.jsonc",
  "pyproject.toml",
  "Cargo.toml",
  "go.mod",
]

/** True when `dir` looks like a real project (used to pick the config scope). */
export function isProjectDir(dir: string): boolean {
  return PROJECT_MARKERS.some((marker) => pathExists(path.join(dir, marker)))
}

/** Minimal JSONC support: strip // and /* *​/ comments and trailing commas. */
export function stripJsonComments(input: string): string {
  let out = ""
  let inString = false
  let inLine = false
  let inBlock = false
  let escaped = false
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!
    const next = input[i + 1]
    if (inLine) {
      if (ch === "\n") {
        inLine = false
        out += ch
      }
      continue
    }
    if (inBlock) {
      if (ch === "*" && next === "/") {
        inBlock = false
        i++
      }
      continue
    }
    if (inString) {
      out += ch
      if (escaped) escaped = false
      else if (ch === "\\") escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      inString = true
      out += ch
      continue
    }
    if (ch === "/" && next === "/") {
      inLine = true
      i++
      continue
    }
    if (ch === "/" && next === "*") {
      inBlock = true
      i++
      continue
    }
    out += ch
  }
  return out.replace(/,(\s*[}\]])/g, "$1")
}
