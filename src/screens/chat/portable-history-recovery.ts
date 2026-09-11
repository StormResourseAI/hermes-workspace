import type { HistoryResponse } from './types'

/**
 * After a background send-stream run finishes, portable chat must prefer the
 * server-persisted transcript over the localStorage snapshot captured before
 * the user navigated away.
 */
export function preferServerPortableHistory(
  server: HistoryResponse | null | undefined,
  local: HistoryResponse,
): HistoryResponse {
  const serverMessages = Array.isArray(server?.messages) ? server.messages : []
  const localMessages = Array.isArray(local.messages) ? local.messages : []
  if (serverMessages.length >= localMessages.length && serverMessages.length > 0) {
    return {
      sessionKey: server?.sessionKey || local.sessionKey || 'main',
      messages: serverMessages,
    }
  }
  return local
}
