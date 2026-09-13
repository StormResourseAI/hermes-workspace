import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import YAML from 'yaml'
import { parseOperationsAgentId } from '../lib/operations-session'
import { getOperationsProfileDefinition } from '../lib/operations-profiles'

export {
  getOperationsSessionKey,
  parseOperationsAgentId,
  buildOperationsExecutionSessionKey,
  getOperationsFriendlySessionKey,
} from '../lib/operations-session'

export type OperationsDispatch = {
  sessionKey: string
  agentId: string
  displayName: string
  profileName: string
  model: string
  provider: string
  cwd: string
  providerBaseUrl: string
}

export type TerminalIdentity = {
  pwd: string
  branch: string
  sha: string
}

function hermesRoot(): string {
  return (
    process.env.HERMES_HOME ??
    process.env.CLAUDE_HOME ??
    path.join(homedir(), '.hermes')
  )
}

function readYaml(filePath: string): Record<string, unknown> {
  try {
    const parsed = YAML.parse(readFileSync(filePath, 'utf-8'))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readConfiguredModel(cfg: Record<string, unknown>): string {
  const model = cfg.model
  if (typeof model === 'string') return model.trim()
  if (model && typeof model === 'object' && !Array.isArray(model)) {
    const rec = model as Record<string, unknown>
    return readString(rec.default) || readString(rec.model)
  }
  return ''
}

function readConfiguredProvider(cfg: Record<string, unknown>): string {
  const model = cfg.model
  if (model && typeof model === 'object' && !Array.isArray(model)) {
    return readString((model as Record<string, unknown>).provider)
  }
  return ''
}

function readConfiguredBaseUrl(
  cfg: Record<string, unknown>,
  provider: string,
): string {
  const model = cfg.model
  if (model && typeof model === 'object' && !Array.isArray(model)) {
    const direct = readString((model as Record<string, unknown>).base_url)
    if (direct) return direct
  }

  const customProviders = cfg.custom_providers
  if (!Array.isArray(customProviders)) return ''
  for (const entry of customProviders) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue
    const candidate = entry as Record<string, unknown>
    if (readString(candidate.name) === provider) {
      return readString(candidate.base_url)
    }
  }
  return ''
}

function profileHome(profileName: string): string {
  if (profileName === 'default') return hermesRoot()
  return path.join(hermesRoot(), 'profiles', profileName)
}

export function resolveOperationsDispatch(
  sessionKey: string,
): OperationsDispatch | null {
  const agentId = parseOperationsAgentId(sessionKey)
  if (!agentId) return null
  const definition = getOperationsProfileDefinition(agentId)
  if (!definition) return null

  const profileName = definition.id
  const configPath = path.join(profileHome(profileName), 'config.yaml')
  if (!existsSync(configPath)) return null
  const cfg = readYaml(configPath)
  const terminal =
    cfg.terminal && typeof cfg.terminal === 'object' && !Array.isArray(cfg.terminal)
      ? (cfg.terminal as Record<string, unknown>)
      : {}
  const cwd = readString(terminal.cwd)
  const model = readConfiguredModel(cfg)
  const provider = readConfiguredProvider(cfg)
  const providerBaseUrl = readConfiguredBaseUrl(cfg, provider)
  if (!cwd || !model || !provider || !providerBaseUrl) return null

  return {
    sessionKey,
    agentId,
    displayName: definition.displayName,
    profileName,
    model,
    provider,
    cwd,
    providerBaseUrl,
  }
}

export function readTerminalIdentity(cwd: string): TerminalIdentity {
  const pwd = cwd.trim() || '.'
  const run = (args: string[]) => {
    try {
      return execFileSync('git', args, {
        cwd: pwd,
        encoding: 'utf8',
        timeout: 4000,
      }).trim()
    } catch {
      return ''
    }
  }
  return {
    pwd,
    branch: run(['branch', '--show-current']),
    sha: run(['rev-parse', '--short', 'HEAD']),
  }
}

export function formatTerminalIdentity(identity: TerminalIdentity): string {
  return [`1. ${identity.pwd}`, `2. ${identity.branch}`, `3. ${identity.sha}`].join(
    '\n',
  )
}

export function isOperationsIdentityPrompt(message: string): boolean {
  const text = message.toLowerCase()
  return (
    text.includes('pwd') &&
    text.includes('git branch') &&
    text.includes('rev-parse')
  )
}

export function buildOperationsScopedMessage(
  message: string,
  dispatch: OperationsDispatch,
  identity: TerminalIdentity,
): string {
  const lines = [
    `<workspace_context active="true" name="${dispatch.displayName}" path="${dispatch.cwd}" />`,
    `<operations_profile id="${dispatch.profileName}" name="${dispatch.displayName}" model="${dispatch.model}" provider="${dispatch.provider}" />`,
    `You are the ${dispatch.displayName} assistant.`,
    'Use the local terminal in the workspace path below. Do not use Codex or cloud providers.',
    `Terminal cwd: ${dispatch.cwd}`,
  ]
  if (isOperationsIdentityPrompt(message)) {
    lines.push(
      'Read-only terminal snapshot (already executed in that cwd):',
      formatTerminalIdentity(identity),
      'When the user asks for pwd / git branch / HEAD, report those three lines exactly. Do not invent a different path, branch, or SHA.',
    )
  } else {
    lines.push(
      'You must use a real Hermes tool for file, terminal, and database work. Do not reuse a stored identity snapshot.',
    )
  }
  lines.push('', message)
  return lines.join('\n')
}
