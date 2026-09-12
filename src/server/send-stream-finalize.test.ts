import { describe, expect, it } from 'vitest'

import { planSendStreamFinalization } from './send-stream-finalize'

describe('planSendStreamFinalization', () => {
  it('does not reopen a terminal run', () => {
    expect(
      planSendStreamFinalization({
        alreadyTerminal: true,
        completed: false,
        hadError: true,
        abortedByTimeout: false,
        clientDisconnected: false,
        persistInBackground: true,
      }),
    ).toEqual({ action: 'none' })
  })

  it('marks successful streams complete', () => {
    expect(
      planSendStreamFinalization({
        alreadyTerminal: false,
        completed: true,
        hadError: false,
        abortedByTimeout: false,
        clientDisconnected: true,
        persistInBackground: true,
      }),
    ).toEqual({ action: 'complete' })
  })

  it('keeps a detached background run alive after browser disconnect', () => {
    expect(
      planSendStreamFinalization({
        alreadyTerminal: false,
        completed: false,
        hadError: false,
        abortedByTimeout: false,
        clientDisconnected: true,
        persistInBackground: true,
      }),
    ).toEqual({ action: 'keep' })
  })

  it('terminalizes timeouts, provider errors, and silent stream ends', () => {
    expect(
      planSendStreamFinalization({
        alreadyTerminal: false,
        completed: false,
        hadError: false,
        abortedByTimeout: true,
        clientDisconnected: false,
        persistInBackground: true,
      }),
    ).toEqual({ action: 'error', reason: 'stream_timeout' })

    expect(
      planSendStreamFinalization({
        alreadyTerminal: false,
        completed: false,
        hadError: true,
        abortedByTimeout: false,
        clientDisconnected: false,
        persistInBackground: true,
        errorMessage: 'Hermes chat stream: 500 boom',
      }),
    ).toEqual({
      action: 'error',
      reason: 'Hermes chat stream: 500 boom',
    })

    expect(
      planSendStreamFinalization({
        alreadyTerminal: false,
        completed: false,
        hadError: false,
        abortedByTimeout: false,
        clientDisconnected: false,
        persistInBackground: true,
      }),
    ).toEqual({
      action: 'error',
      reason: 'stream_ended_without_completion',
    })
  })
})
