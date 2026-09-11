import { describe, expect, it } from 'vitest'
import {
  buildOperationsExecutionSessionKey,
  countActiveOperationsAgents,
  deriveOperationsAgentStatus,
  getOperationsFriendlySessionKey,
  getOperationsSessionKey,
  parseOperationsAgentId,
} from './operations-session'
import {
  operationsSendErrorMessage,
  shouldDisableOperationsRun,
} from './operations-run-button'

describe('operations-session', () => {
  it('keeps framesengineering on the Operations session key', () => {
    const sessionKey = getOperationsSessionKey('framesengineering')
    expect(sessionKey).toBe('agent:main:ops-framesengineering')
    expect(parseOperationsAgentId(sessionKey)).toBe('framesengineering')
    expect(parseOperationsAgentId('main')).toBeNull()
  })

  it('isolates Hermes execution sessions while aggregating under framesengineering', () => {
    const friendlyId = getOperationsSessionKey('framesengineering')
    const first = buildOperationsExecutionSessionKey(friendlyId, 'run_one')
    const second = buildOperationsExecutionSessionKey(friendlyId, 'run_two')
    expect(first).not.toBe(second)
    expect(first).not.toBe(friendlyId)
    expect(getOperationsFriendlySessionKey(first)).toBe(friendlyId)
    expect(getOperationsFriendlySessionKey(second)).toBe(friendlyId)
    expect(parseOperationsAgentId(first)).toBe('framesengineering')
    expect(parseOperationsAgentId(second)).toBe('framesengineering')
  })

  it('returns idle after a finished local Operations turn', () => {
    expect(
      deriveOperationsAgentStatus({
        status: null,
        updatedAt: Date.now(),
      }),
    ).toBe('idle')
    expect(
      deriveOperationsAgentStatus({
        status: 'complete',
        updatedAt: Date.now(),
      }),
    ).toBe('idle')
  })

  it('returns active for canonical live run statuses without a client-side timeout', () => {
    expect(
      deriveOperationsAgentStatus({
        status: 'active',
        updatedAt: Date.now(),
      }),
    ).toBe('active')
    expect(
      deriveOperationsAgentStatus({
        status: 'accepted',
        updatedAt: Date.now() - 130_000,
      }),
    ).toBe('active')
    expect(countActiveOperationsAgents(['idle', 'active', 'error'])).toBe(1)
  })
})

describe('operations run button', () => {
  it('disables empty sends and surfaces send failures', () => {
    expect(shouldDisableOperationsRun({ draft: '   ', isSending: false })).toBe(
      true,
    )
    expect(shouldDisableOperationsRun({ draft: 'pwd', isSending: true })).toBe(
      true,
    )
    expect(shouldDisableOperationsRun({ draft: 'pwd', isSending: false })).toBe(
      false,
    )
    expect(operationsSendErrorMessage(new Error('HTTP 401: Unauthorized'))).toBe(
      'HTTP 401: Unauthorized',
    )
    expect(operationsSendErrorMessage(new Error('Session busy'))).toBe(
      'Session busy',
    )
    expect(operationsSendErrorMessage(new Error('Request timed out'))).toBe(
      'Request timed out',
    )
  })
})
