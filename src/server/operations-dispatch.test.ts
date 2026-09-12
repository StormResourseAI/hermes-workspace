import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const originalEnv = { ...process.env }
let tempHome = ''

beforeEach(() => {
  vi.resetModules()
  tempHome = mkdtempSync(path.join(tmpdir(), 'ops-dispatch-'))
  process.env = { ...originalEnv }
  process.env.HERMES_HOME = tempHome
})

afterEach(() => {
  process.env = { ...originalEnv }
  rmSync(tempHome, { recursive: true, force: true })
})

describe('operations-dispatch', () => {
  it('keeps framesengineering identity on the Operations session key', async () => {
    const { getOperationsSessionKey, parseOperationsAgentId } = await import(
      './operations-dispatch'
    )
    const sessionKey = getOperationsSessionKey('framesengineering')
    expect(sessionKey).toBe('agent:main:ops-framesengineering')
    expect(parseOperationsAgentId(sessionKey)).toBe('framesengineering')
    expect(parseOperationsAgentId('main')).toBeNull()
  })

  it('resolves Qwen Local + stormbot-os from the framesengineering profile', async () => {
    const profile = path.join(tempHome, 'profiles', 'framesengineering')
    mkdirSync(profile, { recursive: true })
    writeFileSync(
      path.join(profile, 'config.yaml'),
      [
        'model: qwen3.5:9b-q4_K_M',
        'terminal:',
        '  backend: local',
        '  cwd: /Users/brianackley/stormbot-os',
        '',
      ].join('\n'),
      'utf-8',
    )

    const { resolveOperationsDispatch, buildOperationsScopedMessage } =
      await import('./operations-dispatch')
    const dispatch = resolveOperationsDispatch('agent:main:ops-framesengineering')
    expect(dispatch).toMatchObject({
      agentId: 'framesengineering',
      profileName: 'framesengineering',
      model: 'qwen3.5:9b-q4_K_M',
      provider: 'Qwen Local',
      cwd: '/Users/brianackley/stormbot-os',
      providerBaseUrl: 'http://127.0.0.1:11434/v1',
    })

    const scoped = buildOperationsScopedMessage(
      'report pwd',
      dispatch!,
      {
        pwd: '/Users/brianackley/stormbot-os',
        branch: 'certified/stormbot-stable-2026-08-19',
        sha: '6f9b44d',
      },
    )
    expect(scoped).toContain('name="framesengineering"')
    expect(scoped).toContain('/Users/brianackley/stormbot-os')
    expect(scoped).toContain('qwen3.5:9b-q4_K_M')
    expect(scoped).toContain('provider="Qwen Local"')
    expect(scoped).toContain('You must use a real Hermes tool')
    expect(scoped).not.toContain('report those three lines exactly')
    expect(scoped).not.toContain('codex')
  })

  it('recognizes the Operations terminal identity smoke prompt', async () => {
    const { isOperationsIdentityPrompt } = await import('./operations-dispatch')
    expect(
      isOperationsIdentityPrompt(
        'Do not change anything.\nUsing the terminal, report only:\n1. pwd\n2. git branch --show-current\n3. git rev-parse --short HEAD',
      ),
    ).toBe(true)
    expect(isOperationsIdentityPrompt('Prepare HVAC outreach')).toBe(false)
  })

  it('reads model.default when the profile uses the custom-provider dict form', async () => {
    const profile = path.join(tempHome, 'profiles', 'framesengineering')
    mkdirSync(profile, { recursive: true })
    writeFileSync(
      path.join(profile, 'config.yaml'),
      [
        'model:',
        '  default: qwen3.5:9b-q4_K_M',
        '  provider: custom',
        '  base_url: http://127.0.0.1:11434/v1',
        '  api_mode: chat_completions',
        'terminal:',
        '  cwd: /Users/brianackley/stormbot-os',
        '',
      ].join('\n'),
      'utf-8',
    )
    const { resolveOperationsDispatch } = await import('./operations-dispatch')
    const dispatch = resolveOperationsDispatch('agent:main:ops-framesengineering')
    expect(dispatch?.model).toBe('qwen3.5:9b-q4_K_M')
    expect(dispatch?.cwd).toBe('/Users/brianackley/stormbot-os')
  })

  it('does not force portable Ollama chat for Operations sessions', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync(
      path.join(__dirname, '../routes/api/send-stream.ts'),
      'utf8',
    )
    expect(src).toContain(
      'if (!operationsDispatch && requestModel)',
    )
    expect(src).toContain("chatMode = 'enhanced-claude'")
    expect(src).toContain('require_model_lock: Boolean(operationsDispatch)')
    expect(src).not.toContain('provider: operationsDispatch?.provider')
    expect(src).not.toMatch(
      /if \(operationsDispatch\) \{\s*chatMode = 'portable'/,
    )
    expect(src).toContain('createGatewaySession')
    expect(src).toContain('finalizeRunIfNeeded')
    expect(src).toContain('planSendStreamFinalization')
    expect(src).toContain('execution_session=')
    expect(src).toContain('streamChat ever starts')
    expect(src).toContain('ops:${operationsDispatch.agentId}:${runId}')
  })

  it('formats the exact Operations smoke lines from the local cwd snapshot', async () => {
    const { formatTerminalIdentity } = await import('./operations-dispatch')
    expect(
      formatTerminalIdentity({
        pwd: '/Users/brianackley/stormbot-os',
        branch: 'certified/stormbot-stable-2026-08-19',
        sha: '6f9b44d',
      }),
    ).toBe(
      [
        '1. /Users/brianackley/stormbot-os',
        '2. certified/stormbot-stable-2026-08-19',
        '3. 6f9b44d',
      ].join('\n'),
    )
  })

  it('gives independent Operations runs isolated Hermes sessions under framesengineering', async () => {
    const {
      buildOperationsExecutionSessionKey,
      getOperationsFriendlySessionKey,
      getOperationsSessionKey,
      parseOperationsAgentId,
    } = await import('./operations-dispatch')
    const friendlyId = getOperationsSessionKey('framesengineering')
    const first = buildOperationsExecutionSessionKey(friendlyId, 'run_stale')
    const second = buildOperationsExecutionSessionKey(friendlyId, 'run_next')
    expect(first).not.toBe(second)
    expect(first).not.toBe(friendlyId)
    expect(getOperationsFriendlySessionKey(first)).toBe(friendlyId)
    expect(getOperationsFriendlySessionKey(second)).toBe(friendlyId)
    expect(parseOperationsAgentId(first)).toBe('framesengineering')
    expect(parseOperationsAgentId(second)).toBe('framesengineering')
  })
})
