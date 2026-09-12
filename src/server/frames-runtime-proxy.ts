import { framesOperatorAuthHeaders, getFramesOperatorToken } from './frames-operator-auth'

const ALLOWED_PATHS = new Set([
  '/health',
  '/state',
  '/registry',
  '/v1/chat/completions',
])
const ALLOWED_HOSTS = new Set(['127.0.0.1', 'localhost'])
const ALLOWED_PORTS = new Set(['8000'])
const RUNTIME_PATH = '/ui-runtime'
const OPERATOR_TOKEN_HEADER = 'x-stormbot-operator-token'

export type CustomRuntimeProxyInput = {
  runtimeUrl?: unknown
  pathname?: unknown
  method?: unknown
  body?: unknown
}

function jsonError(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  })
}

function normalizeRuntimeUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('runtimeUrl is required.')
  }
  const parsed = new URL(value.trim())
  if (parsed.protocol === 'ws:') parsed.protocol = 'http:'
  if (parsed.protocol === 'wss:') parsed.protocol = 'https:'
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('runtimeUrl must use http or https.')
  }
  if (!ALLOWED_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new Error('runtimeUrl is not in the allowed hosts list.')
  }
  const port = parsed.port || (parsed.protocol === 'https:' ? '443' : '80')
  if (!ALLOWED_PORTS.has(port)) {
    throw new Error('runtimeUrl is not in the allowed hosts list.')
  }
  parsed.username = ''
  parsed.password = ''
  parsed.search = ''
  parsed.hash = ''
  const path = parsed.pathname.replace(/\/$/, '') || '/'
  if (path !== RUNTIME_PATH) {
    throw new Error('runtimeUrl is not a FRAMES ui-runtime endpoint.')
  }
  parsed.pathname = RUNTIME_PATH
  return parsed.toString().replace(/\/$/, '')
}

function normalizePathname(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('pathname is required.')
  }
  const trimmed = value.trim()
  const pathname = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  if (!ALLOWED_PATHS.has(pathname)) {
    throw new Error('pathname is not allowed.')
  }
  return pathname
}

function normalizeMethod(value: unknown): 'GET' | 'POST' {
  if (typeof value !== 'string') return 'GET'
  return value.trim().toUpperCase() === 'POST' ? 'POST' : 'GET'
}

function stripSecrets(text: string): string {
  const token = getFramesOperatorToken()
  if (!token) return text
  return text.split(token).join('[redacted]')
}

function isClientInputError(message: string): boolean {
  return (
    message === 'runtimeUrl is required.' ||
    message === 'pathname is required.' ||
    message === 'runtimeUrl must use http or https.' ||
    message === 'runtimeUrl is not in the allowed hosts list.' ||
    message === 'runtimeUrl is not a FRAMES ui-runtime endpoint.' ||
    message === 'pathname is not allowed.'
  )
}

export async function proxyFramesCustomRuntime(
  input: CustomRuntimeProxyInput,
  signal?: AbortSignal,
): Promise<Response> {
  let runtimeUrl: string
  let pathname: string
  let method: 'GET' | 'POST'
  try {
    runtimeUrl = normalizeRuntimeUrl(input.runtimeUrl)
    pathname = normalizePathname(input.pathname)
    method = normalizeMethod(input.method)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Invalid custom runtime request.'
    return jsonError(isClientInputError(message) ? 400 : 500, message)
  }

  const authHeaders = framesOperatorAuthHeaders()
  if (!authHeaders['X-StormBot-Operator-Token']) {
    return jsonError(503, 'FRAMES runtime credentials are unavailable.')
  }

  try {
    const upstream = await fetch(`${runtimeUrl}${pathname}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...authHeaders,
        ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
      },
      body: method === 'POST' ? JSON.stringify(input.body ?? {}) : undefined,
      cache: 'no-store',
      signal,
    })
    const text = stripSecrets(await upstream.text())
    const headers = new Headers()
    const contentType = upstream.headers.get('content-type') ?? 'application/json'
    headers.set('Content-Type', contentType)
    headers.set('Cache-Control', 'no-store')
    for (const name of [OPERATOR_TOKEN_HEADER, 'www-authenticate', 'authorization']) {
      headers.delete(name)
    }
    return new Response(text, { status: upstream.status, headers })
  } catch {
    return jsonError(502, 'Custom runtime proxy failed.')
  }
}
