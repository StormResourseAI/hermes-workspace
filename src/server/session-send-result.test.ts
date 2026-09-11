import { describe, expect, it } from 'vitest'

import {
  parseSendStreamSseBuffer,
  resolveSessionSendResult,
  shouldStopSessionSendWait,
} from './session-send-result'

describe('session-send result mapping', () => {
  it('returns after started instead of waiting for done', () => {
    const sse = parseSendStreamSseBuffer(
      'event: started\ndata: {"runId":"run_1"}\n\n',
    )
    expect(sse).toMatchObject({ started: true, done: false, runId: 'run_1' })
    expect(shouldStopSessionSendWait(sse)).toBe(true)
    expect(resolveSessionSendResult({ upstreamStatus: 200, sse })).toEqual({
      ok: true,
      status: 200,
      queued: true,
      runId: 'run_1',
    })
  })

  it('surfaces 401, 500, 409, and network failures', () => {
    expect(resolveSessionSendResult({ upstreamStatus: 401 })).toMatchObject({
      ok: false,
      status: 401,
      error: 'Unauthorized',
    })
    expect(
      resolveSessionSendResult({
        upstreamStatus: 500,
        upstreamError: 'gateway exploded',
      }),
    ).toMatchObject({ ok: false, status: 500, error: 'gateway exploded' })
    expect(
      resolveSessionSendResult({
        upstreamStatus: 200,
        sse: parseSendStreamSseBuffer(
          'event: error\ndata: {"message":"Another Hermes process is using this session; waiting for it to finish before starting your turn..."}\n\n',
        ),
      }),
    ).toMatchObject({ ok: false, status: 409 })
    expect(resolveSessionSendResult({ networkFailed: true })).toMatchObject({
      ok: false,
      status: 502,
      error: 'Network failure talking to send-stream',
    })
  })

  it('does not treat an empty click path as success', () => {
    expect(resolveSessionSendResult({ networkFailed: true }).ok).toBe(false)
    expect(resolveSessionSendResult({ upstreamStatus: 500 }).ok).toBe(false)
  })
})
