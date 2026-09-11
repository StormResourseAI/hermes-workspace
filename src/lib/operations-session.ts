export const OPERATIONS_SESSION_PREFIX = 'agent:main:ops-'
export const OPERATIONS_ACTIVE_RUNS_QUERY_KEY = ['operations', 'active-runs'] as const
// Operations cards must not stay "active" after a finished local turn.

export function getOperationsSessionKey(agentId: string): string {
  return `${OPERATIONS_SESSION_PREFIX}${agentId}`
}

export function parseOperationsAgentId(
  sessionKey: string | null | undefined,
): string | null {
  const key = (sessionKey ?? '').trim()
  if (!key.startsWith(OPERATIONS_SESSION_PREFIX)) return null
  const rest = key.slice(OPERATIONS_SESSION_PREFIX.length).trim()
  if (!rest) return null
  return rest.split(':')[0] || null
}

export function buildOperationsExecutionSessionKey(
  friendlyId: string,
  runId: string,
): string {
  const friendly = friendlyId.trim()
  const id = runId.trim()
  if (!friendly || !id) return friendly
  return `${friendly}:${id}`
}

export function getOperationsFriendlySessionKey(
  sessionKey: string | null | undefined,
): string | null {
  const agentId = parseOperationsAgentId(sessionKey)
  return agentId ? getOperationsSessionKey(agentId) : null
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

  if (
    status.includes('run') ||
    status.includes('active') ||
    status.includes('progress') ||
    status.includes('accepted') ||
    status.includes('stalled')
  ) {
    return 'active'
  }

  return 'idle'
}

export function countActiveOperationsAgents(
  statuses: Array<OperationsAgentLiveStatus | string | null | undefined>,
): number {
  return statuses.filter((status) => status === 'active').length
}
