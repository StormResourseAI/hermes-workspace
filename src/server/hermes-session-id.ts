export function readCreatedHermesSessionId(payload: unknown): string {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return ''
  const rec = payload as Record<string, unknown>
  const nested =
    rec.session && typeof rec.session === 'object' && !Array.isArray(rec.session)
      ? (rec.session as Record<string, unknown>)
      : null
  const candidates = [rec.id, rec.session_id, nested?.id, nested?.session_id]
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}
