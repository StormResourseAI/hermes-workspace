import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getGatewayBearerToken } from './gateway-bearer'

const originalEnv = { ...process.env }
let tempHome = ''

beforeEach(() => {
  tempHome = mkdtempSync(path.join(tmpdir(), 'gw-bearer-'))
  process.env = { ...originalEnv }
  delete process.env.HERMES_API_TOKEN
  delete process.env.CLAUDE_API_TOKEN
  delete process.env.API_SERVER_KEY
  process.env.HERMES_HOME = tempHome
  process.env.HOME = tempHome
})

afterEach(() => {
  process.env = { ...originalEnv }
  rmSync(tempHome, { recursive: true, force: true })
})

describe('getGatewayBearerToken', () => {
  it('reads API_SERVER_KEY from HERMES_HOME/.env at call time', () => {
    writeFileSync(path.join(tempHome, '.env'), 'API_SERVER_KEY=gateway-secret-test\n')
    expect(getGatewayBearerToken()).toBe('gateway-secret-test')
  })

  it('prefers process env over the env file', () => {
    writeFileSync(path.join(tempHome, '.env'), 'API_SERVER_KEY=from-file\n')
    process.env.HERMES_API_TOKEN = 'from-env'
    expect(getGatewayBearerToken()).toBe('from-env')
  })
})
