import { describe, expect, it } from 'vitest'

import { planSendStreamClientDisconnect } from './send-stream-disconnect'

describe('planSendStreamClientDisconnect', () => {
  it('keeps the upstream assistant run alive after UI navigation', () => {
    expect(planSendStreamClientDisconnect()).toEqual({
      abortUpstream: false,
      markHandoff: false,
      persistInBackground: true,
    })
  })
})
