export const OPERATIONS_SESSION_PREFIX = 'agent:main:ops-'
// Operations cards must not stay "active" after a finished local turn.

export function getOperationsSessionKey(agentId: string): string {
  return `${OPERATIONS_SESSION_PREFIX}${agentId}`
}

export function parseOperationsAgentId(
  sessionKey: string | null | undefined,
): string | null {
  const key = (sessionKey ?? '').trim()
  if (!key.startsWith(OPERATIONS_SESSION_PREFIX)) return null
  const agentId = key.slice(OPERATIONS_SESSION_PREFIX.length).trim()
  return agentId || null
}

export type OperationsAgentLiveStatus = 'idle' | 'active' | 'error'

export function deriveOperationsAgentStatus(session: {
  status?: string | null
  updatedAt?: number | string | null
} | null): OperationsAgentLiveStatus {
  if (!session) return 'idle'

  const status = (session.status ?? '').toString().trim().toLowerCase()
  if (status.includes('fail') || status.includes('error')) return 'error'
  if (
    !status ||
    status === 'ended' ||
    status === 'idle' ||
    status === 'complete' ||
    status === 'done' ||
    status === 'handoff'
  ) {
    return 'idle'
  }

  const updatedAt = Number(session.updatedAt)
  if (
    (status.includes('run') ||
      status.includes('active') ||
      status.includes('progress') ||
      status.includes('accepted')) &&
    Number.isFinite(updatedAt) &&
    Date.now() - updatedAt < 120_000
  ) {
    return 'active'
  }

  return 'idle'
}
