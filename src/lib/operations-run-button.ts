export function shouldDisableOperationsRun(input: {
  draft: string
  isSending: boolean
}): boolean {
  return !input.draft.trim() || input.isSending
}

export function operationsSendErrorMessage(
  error: unknown,
  fallback = 'Failed to start run',
): string {
  if (error instanceof Error && error.message.trim()) return error.message
  if (typeof error === 'string' && error.trim()) return error
  return fallback
}
