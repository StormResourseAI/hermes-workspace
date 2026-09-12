import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getFramesOperatorToken } from './frames-operator-auth'

const originalEnv = { ...process.env }
let tempDir = ''

beforeEach(() => {
  tempDir = mkdtempSync(path.join(tmpdir(), 'frames-op-auth-'))
  process.env = { ...originalEnv }
  delete process.env.STORMBOT_CLIENTS_AUTH_TOKEN
  delete process.env.CUSTOM_RUNTIME_AUTH_TOKEN
  delete process.env.FRAMES_ENV_FILE
  delete process.env.FRAMES_ROOT
  delete process.env.STORMBOT_ROOT
})

afterEach(() => {
  process.env = { ...originalEnv }
  rmSync(tempDir, { recursive: true, force: true })
})

describe('getFramesOperatorToken', () => {
  it('reads STORMBOT_CLIENTS_AUTH_TOKEN from FRAMES_ENV_FILE at call time', () => {
    const envFile = path.join(tempDir, '.env')
    writeFileSync(envFile, 'STORMBOT_CLIENTS_AUTH_TOKEN=frames-test-operator\n')
    process.env.FRAMES_ENV_FILE = envFile
    expect(getFramesOperatorToken()).toBe('frames-test-operator')
  })

  it('prefers process env over the env file', () => {
    const envFile = path.join(tempDir, '.env')
    writeFileSync(envFile, 'STORMBOT_CLIENTS_AUTH_TOKEN=from-file\n')
    process.env.FRAMES_ENV_FILE = envFile
    process.env.STORMBOT_CLIENTS_AUTH_TOKEN = 'from-env'
    expect(getFramesOperatorToken()).toBe('from-env')
  })

  it('returns empty when the token is missing', () => {
    process.env.FRAMES_ENV_FILE = path.join(tempDir, 'missing.env')
    expect(getFramesOperatorToken()).toBe('')
  })
})
