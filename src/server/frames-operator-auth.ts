import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const TOKEN_KEY = 'STORMBOT_CLIENTS_AUTH_TOKEN'
const DEFAULT_FRAMES_ROOT = '/Users/brianackley/stormbot-os'

function unquote(value: string): string {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function readEnvFileToken(filePath: string): string {
  if (!existsSync(filePath)) return ''
  try {
    const text = readFileSync(filePath, 'utf8')
    for (const raw of text.split('\n')) {
      const line = raw.trim()
      if (!line || line.startsWith('#') || !line.includes('=')) continue
      const eq = line.indexOf('=')
      const key = line.slice(0, eq).trim()
      if (key !== TOKEN_KEY) continue
      const value = unquote(line.slice(eq + 1))
      if (value) return value
    }
  } catch {
    return ''
  }
  return ''
}

function framesEnvFiles(): string[] {
  const explicit = process.env.FRAMES_ENV_FILE?.trim()
  if (explicit) return [explicit]
  const root =
    process.env.FRAMES_ROOT?.trim() ||
    process.env.STORMBOT_ROOT?.trim() ||
    DEFAULT_FRAMES_ROOT
  return [join(root, '.env')]
}

/**
 * FRAMES operator token for Workroom /ui-runtime.
 * Read at call time from process env or the FRAMES .env file.
 * Never log, persist, or return this to the browser.
 */
export function getFramesOperatorToken(): string {
  const fromEnv =
    process.env.STORMBOT_CLIENTS_AUTH_TOKEN?.trim() ||
    process.env.CUSTOM_RUNTIME_AUTH_TOKEN?.trim() ||
    ''
  if (fromEnv) return fromEnv
  for (const file of framesEnvFiles()) {
    const value = readEnvFileToken(file)
    if (value) return value
  }
  return ''
}

export function framesOperatorAuthHeaders(): Record<string, string> {
  const token = getFramesOperatorToken()
  return token ? { 'X-StormBot-Operator-Token': token } : {}
}
