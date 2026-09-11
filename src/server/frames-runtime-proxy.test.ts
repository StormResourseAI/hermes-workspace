import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { proxyFramesCustomRuntime } from './frames-runtime-proxy'

const originalEnv = { ...process.env }
const originalFetch = globalThis.fetch

beforeEach(() => {
  process.env = { ...originalEnv }
  process.env.STORMBOT_CLIENTS_AUTH_TOKEN = 'frames-test-operator'
  delete process.env.CUSTOM_RUNTIME_AUTH_TOKEN
  delete process.env.FRAMES_ENV_FILE
})

afterEach(() => {
  process.env = { ...originalEnv }
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
})

describe('proxyFramesCustomRuntime', () => {
  it('injects the FRAMES operator header and does not echo the token', async () => {
    const fetchSpy = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true, authority: 'FRAMES', read_only: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    globalThis.fetch = fetchSpy as typeof fetch

    const response = await proxyFramesCustomRuntime({
      runtimeUrl: 'http://127.0.0.1:8000/ui-runtime',
      pathname: '/health',
      method: 'GET',
    })
    const body = await response.text()

    expect(response.status).toBe(200)
    expect(body).toContain('"authority":"FRAMES"')
    expect(body).not.toContain('frames-test-operator')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://127.0.0.1:8000/ui-runtime/health')
    const headers = new Headers(init.headers)
    expect(headers.get('X-StormBot-Operator-Token')).toBe('frames-test-operator')
  })

  it('accepts localhost:8000/ui-runtime as the FRAMES runtime', async () => {
    const fetchSpy = vi.fn(async () => new Response('{"ok":true}', { status: 200 }))
    globalThis.fetch = fetchSpy as typeof fetch

    const response = await proxyFramesCustomRuntime({
      runtimeUrl: 'http://localhost:8000/ui-runtime',
      pathname: '/state',
    })

    expect(response.status).toBe(200)
    expect(fetchSpy.mock.calls[0]?.[0]).toBe('http://localhost:8000/ui-runtime/state')
  })

  it('rejects non-FRAMES hosts', async () => {
    const fetchSpy = vi.fn()
    globalThis.fetch = fetchSpy as typeof fetch
    const response = await proxyFramesCustomRuntime({
      runtimeUrl: 'http://evil.example:8000/ui-runtime',
      pathname: '/health',
    })
    expect(response.status).toBe(400)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('rejects disallowed pathnames', async () => {
    const fetchSpy = vi.fn()
    globalThis.fetch = fetchSpy as typeof fetch
    const response = await proxyFramesCustomRuntime({
      runtimeUrl: 'http://127.0.0.1:8000/ui-runtime',
      pathname: '/clients',
    })
    expect(response.status).toBe(400)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('returns 503 when operator credentials are missing', async () => {
    delete process.env.STORMBOT_CLIENTS_AUTH_TOKEN
    process.env.FRAMES_ENV_FILE = '/tmp/frames-missing-operator.env'
    const fetchSpy = vi.fn()
    globalThis.fetch = fetchSpy as typeof fetch
    const response = await proxyFramesCustomRuntime({
      runtimeUrl: 'http://127.0.0.1:8000/ui-runtime',
      pathname: '/health',
    })
    const body = await response.text()
    expect(response.status).toBe(503)
    expect(body).not.toMatch(/STORMBOT_CLIENTS_AUTH_TOKEN/)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
