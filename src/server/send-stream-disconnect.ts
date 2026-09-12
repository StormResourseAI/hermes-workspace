/**
 * Client disconnect policy for /api/send-stream.
 *
 * Navigating away cancels the browser SSE reader. The assistant run must
 * continue server-side and persist its final result for when the user returns.
 * Explicit completion/timeout still uses the normal close+abort path.
 */
export type SendStreamClientDisconnectPlan = {
  abortUpstream: boolean
  markHandoff: boolean
  persistInBackground: boolean
}

export function planSendStreamClientDisconnect(): SendStreamClientDisconnectPlan {
  return {
    abortUpstream: false,
    markHandoff: false,
    persistInBackground: true,
  }
}
