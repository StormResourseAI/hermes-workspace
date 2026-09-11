import { describe, expect, it } from 'vitest'
import {
  deriveOperationsAgentStatus,
  getOperationsSessionKey,
  parseOperationsAgentId,
} from './operations-session'

describe('operations-session', () => {
  it('keeps framesengineering on the Operations session key', () => {
    const sessionKey = getOperationsSessionKey('framesengineering')
    expect(sessionKey).toBe('agent:main:ops-framesengineering')
    expect(parseOperationsAgentId(sessionKey)).toBe('framesengineering')
    expect(parseOperationsAgentId('main')).toBeNull()
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

  it('returns active only while a run is actually in progress', () => {
    expect(
      deriveOperationsAgentStatus({
        status: 'active',
        updatedAt: Date.now(),
      }),
    ).toBe('active')
    expect(
      deriveOperationsAgentStatus({
        status: 'active',
        updatedAt: Date.now() - 130_000,
      }),
    ).toBe('idle')
  })
})
