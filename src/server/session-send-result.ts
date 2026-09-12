export type SessionSendResult = {
  ok: boolean
  status: number
  queued: boolean
  error?: string
  runId?: string
}

export function parseSendStreamSseBuffer(buffer: string): {
  started: boolean
  done: boolean
  error: string | null
  runId: string | null
} {
  const text = buffer || ''
  const errorMatch = text.match(
    /event:\s*error\s*\ndata:\s*(\{[\s\S]*?\})\s*(?:\n\n|$)/,
  )
  let error: string | null = null
  if (errorMatch?.[1]) {
    try {
      const parsed = JSON.parse(errorMatch[1]) as { message?: unknown }
      if (typeof parsed.message === 'string' && parsed.message.trim()) {
        error = parsed.message.trim()
      }
    } catch {
      error = 'send-stream error'
    }
  } else if (text.includes('event: error')) {
    error = 'send-stream error'
  }

  const startedMatch = text.match(
    /event:\s*started\s*\ndata:\s*(\{[\s\S]*?\})\s*(?:\n\n|$)/,
  )
  let runId: string | null = null
  if (startedMatch?.[1]) {
    try {
      const parsed = JSON.parse(startedMatch[1]) as { runId?: unknown }
      if (typeof parsed.runId === 'string' && parsed.runId.trim()) {
        runId = parsed.runId.trim()
      }
    } catch {
      runId = null
    }
  }

  return {
    started: text.includes('event: started'),
    done: text.includes('event: done'),
    error,
    runId,
  }
}

export function resolveSessionSendResult(input: {
  networkFailed?: boolean
  upstreamStatus?: number
  upstreamError?: string
  sse?: ReturnType<typeof parseSendStreamSseBuffer>
}): SessionSendResult {
  if (input.networkFailed) {
    return {
      ok: false,
      status: 502,
      queued: false,
      error: 'Network failure talking to send-stream',
    }
  }

  const status = input.upstreamStatus ?? 0
  if (status === 401) {
    return {
      ok: false,
      status: 401,
      queued: false,
      error: input.upstreamError || 'Unauthorized',
    }
  }
  if (status === 409) {
    return {
      ok: false,
      status: 409,
      queued: false,
      error: input.upstreamError || 'Session busy',
    }
  }
  if (status >= 400) {
    return {
      ok: false,
      status: status || 500,
      queued: false,
      error: input.upstreamError || `send-stream failed (${status || 500})`,
    }
  }

  const sse = input.sse
  if (sse?.error) {
    const busy = /busy|waiting for it to finish|another hermes process/i.test(
      sse.error,
    )
    return {
      ok: false,
      status: busy ? 409 : 500,
      queued: false,
      error: sse.error,
      runId: sse.runId ?? undefined,
    }
  }

  return {
    ok: true,
    status: 200,
    queued: true,
    runId: sse?.runId ?? undefined,
  }
}

export function shouldStopSessionSendWait(sse: {
  started: boolean
  done: boolean
  error: string | null
}): boolean {
  return Boolean(sse.started || sse.done || sse.error)
}
