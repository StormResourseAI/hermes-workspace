import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const TOKEN_KEYS = ['HERMES_API_TOKEN', 'CLAUDE_API_TOKEN', 'API_SERVER_KEY']

function readEnvFileKey(filePath: string): string {
  if (!existsSync(filePath)) return ''
  try {
    const text = readFileSync(filePath, 'utf8')
    for (const raw of text.split('\n')) {
      const line = raw.trim()
      if (!line || line.startsWith('#') || !line.includes('=')) continue
      const eq = line.indexOf('=')
      const key = line.slice(0, eq).trim()
      let value = line.slice(eq + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      if (TOKEN_KEYS.includes(key) && value) return value
    }
  } catch {
    return ''
  }
  return ''
}

function hermesEnvFiles(): string[] {
  const home = homedir()
  const hermesHome =
    process.env.HERMES_HOME?.trim() ||
    process.env.CLAUDE_HOME?.trim() ||
    join(home, '.hermes')
  return [
    join(hermesHome, '.env'),
    join(home, '.hermes', '.env'),
    join(home, '.hermes', 'profiles', 'framesengineering', '.env'),
  ]
}

/**
 * Bearer token for the local Hermes Gateway API server.
 * Reads at call time so a later .env sync is picked up without a restart.
 * Does not fall back to Codex OAuth — that token is invalid for API_SERVER_KEY.
 */
export function getGatewayBearerToken(): string {
  const fromEnv =
    process.env.HERMES_API_TOKEN?.trim() ||
    process.env.CLAUDE_API_TOKEN?.trim() ||
    process.env.API_SERVER_KEY?.trim() ||
    ''
  if (fromEnv) return fromEnv
  for (const file of hermesEnvFiles()) {
    const value = readEnvFileKey(file)
    if (value) return value
  }
  return ''
}

export function gatewayAuthHeaders(): Record<string, string> {
  const token = getGatewayBearerToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}
