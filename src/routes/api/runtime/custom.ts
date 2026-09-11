import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { requireLocalOrAuth } from '../../../server/auth-middleware'
import { proxyFramesCustomRuntime } from '../../../server/frames-runtime-proxy'
import { requireJsonContentType } from '../../../server/rate-limit'

export const Route = createFileRoute('/api/runtime/custom')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!requireLocalOrAuth(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck
        let payload: {
          runtimeUrl?: unknown
          pathname?: unknown
          method?: unknown
          body?: unknown
        }
        try {
          payload = (await request.json()) as typeof payload
        } catch {
          return json({ error: 'Invalid JSON request body.' }, { status: 400 })
        }
        return proxyFramesCustomRuntime(payload, request.signal)
      },
    },
  },
})
