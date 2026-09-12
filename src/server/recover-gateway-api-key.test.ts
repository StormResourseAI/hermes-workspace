import { spawn, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const recover = path.join(root, 'scripts/recover-gateway-api-key.py')
const launcher = path.join(root, 'scripts/hermes-workspace-launch.sh')
const plistTemplate = path.join(
  root,
  'macos/com.stormbot.hermes-workspace.plist.template',
)

const UNIT_KEY = 'unit-test-gateway-key-not-live'

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

describe('recover-gateway-api-key', () => {
  const children: Array<ReturnType<typeof spawn>> = []

  afterEach(() => {
    for (const child of children) {
      if (child.pid && !child.killed) child.kill('SIGKILL')
    }
    children.length = 0
  })

  it('recovers API_SERVER_KEY from a live process without leaking it on stderr', async () => {
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
      env: { ...process.env, API_SERVER_KEY: UNIT_KEY },
      stdio: 'ignore',
    })
    children.push(child)
    expect(child.pid).toBeTruthy()
    await sleep(200)
    const result = spawnSync('python3', [recover, '--pid', String(child.pid)], {
      encoding: 'utf8',
    })
    expect(result.status).toBe(0)
    expect(result.stdout).toBe(UNIT_KEY)
    expect(result.stderr).not.toContain(UNIT_KEY)
    expect(result.stderr).toBe('')
  })

  it('fails closed with a non-secret error when the process has no key', async () => {
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
      env: { ...process.env, API_SERVER_KEY: '' },
      stdio: 'ignore',
    })
    children.push(child)
    expect(child.pid).toBeTruthy()
    await sleep(200)
    const result = spawnSync('python3', [recover, '--pid', String(child.pid)], {
      encoding: 'utf8',
    })
    expect(result.status).toBe(1)
    expect(result.stdout).toBe('')
    expect(result.stderr).toMatch(/API_SERVER_KEY/i)
    expect(result.stderr).not.toMatch(/sk-|Bearer /)
  })

  it('fails closed when nothing is listening on the requested port', () => {
    const result = spawnSync(
      'python3',
      [recover, '--host', '127.0.0.1', '--port', '1'],
      { encoding: 'utf8' },
    )
    expect(result.status).toBe(1)
    expect(result.stdout).toBe('')
    expect(result.stderr).toMatch(/not listening/i)
  })
})

describe('workspace launcher auth contract', () => {
  it('recovers the live gateway key and does not persist it in the plist', () => {
    const script = readFileSync(launcher, 'utf8')
    const plist = readFileSync(plistTemplate, 'utf8')
    expect(script).toContain('recover-gateway-api-key.py')
    expect(script).toContain('die')
    expect(script).toMatch(/gateway token: recovered from live :8642 process/)
    expect(script).not.toMatch(/echo .*HERMES_API_TOKEN/)
    expect(plist).not.toContain('HERMES_API_TOKEN')
    expect(plist).not.toContain('API_SERVER_KEY')
    expect(plist).not.toContain('CLAUDE_API_TOKEN')
    expect(script).toContain('HERMES_API_URL="$GATEWAY_URL"')
    expect(script).toContain('HERMES_DASHBOARD_URL="$DASHBOARD_URL"')
    expect(plist).toContain('http://127.0.0.1:8642')
    expect(plist).toContain('http://127.0.0.1:9119')
  })

  it('waits a bounded period for Hermes Agent :8642 before failing closed', () => {
    const script = readFileSync(launcher, 'utf8')
    expect(script).toContain('waiting for Hermes Agent :8642')
    expect(script).toContain('HERMES_GATEWAY_WAIT_ATTEMPTS')
    expect(script).toContain('seq 1 "$max_attempts"')
    expect(script).not.toMatch(/while\s+true/)
  })

  it('falls back to dedicated HERMES_HOME env when the live process has no kernel key', () => {
    const script = readFileSync(launcher, 'utf8')
    expect(script).toContain('HERMES_STORMBOT_HOME')
    expect(script).toContain('/Users/brianackley/.hermes-stormbot')
    expect(script).toContain('gateway token: recovered from dedicated HERMES_HOME env')
    expect(script).toContain('read_env_key')
    expect(script).not.toMatch(/echo .*API_SERVER_KEY/)
  })
})
