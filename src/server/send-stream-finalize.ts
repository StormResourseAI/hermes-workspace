export type SendStreamFinalization = {
  action: 'none' | 'complete' | 'error' | 'keep'
  reason?: string
}

export function planSendStreamFinalization(input: {
  alreadyTerminal: boolean
  completed: boolean
  hadError: boolean
  abortedByTimeout: boolean
  clientDisconnected: boolean
  persistInBackground: boolean
  errorMessage?: string
}): SendStreamFinalization {
  if (input.alreadyTerminal) return { action: 'none' }
  if (input.completed) return { action: 'complete' }
  if (input.hadError) {
    return {
      action: 'error',
      reason: input.errorMessage || 'send_stream_error',
    }
  }
  if (input.abortedByTimeout) {
    return { action: 'error', reason: 'stream_timeout' }
  }
  if (input.clientDisconnected && input.persistInBackground) {
    return { action: 'keep' }
  }
  return {
    action: 'error',
    reason: 'stream_ended_without_completion',
  }
}
