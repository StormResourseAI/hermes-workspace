import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import YAML from 'yaml'
import { parseOperationsAgentId } from '../lib/operations-session'

export {
  getOperationsSessionKey,
  parseOperationsAgentId,
} from '../lib/operations-session'

export const STORMBOT_PROFILE_NAME = 'framesengineering'
export const QWEN_LOCAL_MODEL = 'qwen3.5:9b-q4_K_M'
export const QWEN_LOCAL_BASE_URL = 'http://127.0.0.1:11434/v1'

export type OperationsDispatch = {
  sessionKey: string
  agentId: string
  profileName: string
  model: string
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

function profileHome(profileName: string): string {
  if (profileName === 'default') return hermesRoot()
  return path.join(hermesRoot(), 'profiles', profileName)
}

export function resolveOperationsDispatch(
  sessionKey: string,
): OperationsDispatch | null {
  const agentId = parseOperationsAgentId(sessionKey)
  if (!agentId) return null

  const profileName =
    existsSync(profileHome(agentId)) || agentId === 'default'
      ? agentId
      : existsSync(profileHome(STORMBOT_PROFILE_NAME))
        ? STORMBOT_PROFILE_NAME
        : agentId

  const cfg = readYaml(path.join(profileHome(profileName), 'config.yaml'))
  const terminal =
    cfg.terminal && typeof cfg.terminal === 'object' && !Array.isArray(cfg.terminal)
      ? (cfg.terminal as Record<string, unknown>)
      : {}
  const cwd =
    readString(terminal.cwd) ||
    '/Users/brianackley/stormbot-os'
  const model = readString(cfg.model) || QWEN_LOCAL_MODEL

  return {
    sessionKey,
    agentId,
    profileName,
    model,
    cwd,
    providerBaseUrl: QWEN_LOCAL_BASE_URL,
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
  return [
    `<workspace_context active="true" name="${dispatch.profileName}" path="${dispatch.cwd}" />`,
    `<operations_profile name="${dispatch.profileName}" model="${dispatch.model}" />`,
    `You are the ${dispatch.profileName} assistant.`,
    'Use the local terminal in the workspace path below. Do not use Codex or cloud providers.',
    `Terminal cwd: ${dispatch.cwd}`,
    'Read-only terminal snapshot (already executed in that cwd):',
    formatTerminalIdentity(identity),
    'When the user asks for pwd / git branch / HEAD, report those three lines exactly. Do not invent a different path, branch, or SHA.',
    '',
    message,
  ].join('\n')
}
