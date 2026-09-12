/**
 * ControlSuite-compatible session-send adapter.
 *
 * Operations sends { sessionKey, message } and expects { ok: true } quickly.
 * We forward to the local /api/send-stream endpoint and discard the body
 * (the Operations chat panel polls /api/history at 5s intervals to pick up
 * the reply, so we don't need to hold the stream open here).
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import { requireJsonContentType } from '../../server/rate-limit'
import { resolveOperationsDispatch } from '../../server/operations-dispatch'
import {
  parseSendStreamSseBuffer,
  resolveSessionSendResult,
  shouldStopSessionSendWait,
} from '../../server/session-send-result'

export const Route = createFileRoute('/api/session-send')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck
        try {
          const body = (await request.json()) as {
            sessionKey?: string
            message?: string
            model?: string
            profile?: string
          }
          const sessionKey = (body.sessionKey || '').trim()
          const message = (body.message || '').trim()
          const dispatch = resolveOperationsDispatch(sessionKey)
          const model = (body.model || dispatch?.model || '').trim()
          const profile = (body.profile || dispatch?.profileName || '').trim()
          if (!sessionKey) {
            return json(
              { ok: false, error: 'sessionKey is required' },
              { status: 400 },
            )
          }
          if (!message) {
            return json(
              { ok: false, error: 'message is required' },
              { status: 400 },
            )
          }
          // Fire-and-forget: kick off the stream, then return. Operations
          // chat panel polls /api/session-history for new assistant turns.
          //
          // Use loopback rather than `request.url` so the internal hop never
          // leaves the host. Going back through a public hostname + reverse
          // proxy can drop the session cookie (SameSite / forbidden-header
          // handling differs across Node fetch implementations), which causes
          // the downstream /api/send-stream call to 401 silently and the user
          // never sees their assistant reply. See #XXX.
          const internalPort = process.env.PORT || '3000'
          const url = new URL('/api/send-stream', `http://127.0.0.1:${internalPort}`)
          const cookie = request.headers.get('cookie') || ''
          const hop = fetch(url, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              ...(cookie ? { cookie } : {}),
            },
            body: JSON.stringify({
              sessionKey,
              message,
              model: model || undefined,
              profile: profile || undefined,
            }),
          }).catch(() => null)

          if (dispatch) {
            const upstream = await hop
            if (!upstream) {
              const failed = resolveSessionSendResult({ networkFailed: true })
              return json(
                { ok: false, error: failed.error, sessionKey },
                { status: failed.status },
              )
            }
            if (!upstream.ok) {
              const payload = (await upstream.json().catch(() => ({}))) as {
                error?: string
              }
              const failed = resolveSessionSendResult({
                upstreamStatus: upstream.status,
                upstreamError:
                  typeof payload.error === 'string' ? payload.error : undefined,
              })
              return json(
                { ok: false, error: failed.error, sessionKey },
                { status: failed.status },
              )
            }
            let buf = ''
            if (upstream.body) {
              const reader = upstream.body.getReader()
              const decoder = new TextDecoder()
              const deadline = Date.now() + 15_000
              while (Date.now() < deadline) {
                const { done, value } = await reader.read()
                if (done) break
                buf += decoder.decode(value, { stream: true })
                if (shouldStopSessionSendWait(parseSendStreamSseBuffer(buf))) {
                  break
                }
              }
              try {
                await reader.cancel()
              } catch {
                // Detach; send-stream keeps the run alive in the background.
              }
            }
            const result = resolveSessionSendResult({
              upstreamStatus: upstream.status,
              sse: parseSendStreamSseBuffer(buf),
            })
            if (!result.ok) {
              return json(
                {
                  ok: false,
                  error: result.error,
                  sessionKey,
                  runId: result.runId,
                },
                { status: result.status },
              )
            }
            return json({
              ok: true,
              sessionKey,
              queued: true,
              runId: result.runId,
              model: model || undefined,
              profile: profile || undefined,
            })
          }

          return json({
            ok: true,
            sessionKey,
            queued: true,
            model: model || undefined,
            profile: profile || undefined,
          })
        } catch (error) {
          return json(
            {
              ok: false,
              error:
                error instanceof Error
                  ? error.message
                  : 'Failed to queue message',
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
