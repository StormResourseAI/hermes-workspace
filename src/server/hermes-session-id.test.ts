import { describe, expect, it } from 'vitest'

import { readCreatedHermesSessionId } from './hermes-session-id'

describe('readCreatedHermesSessionId', () => {
  it('reads nested gateway session payloads', () => {
    expect(readCreatedHermesSessionId({ session: { id: 'sess-1' } })).toBe(
      'sess-1',
    )
    expect(readCreatedHermesSessionId({ id: 'sess-2' })).toBe('sess-2')
    expect(readCreatedHermesSessionId({ session_id: 'sess-3' })).toBe('sess-3')
  })

  it('rejects empty payloads so Operations cannot stream a fake session id', () => {
    expect(readCreatedHermesSessionId(null)).toBe('')
    expect(readCreatedHermesSessionId({})).toBe('')
    expect(readCreatedHermesSessionId({ session: {} })).toBe('')
  })
})
