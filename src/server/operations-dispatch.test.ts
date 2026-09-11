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
})
