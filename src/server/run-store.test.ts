import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const originalHermesHome = process.env.HERMES_HOME

let tempHome: string | null = null

beforeEach(() => {
  vi.resetModules()
  tempHome = mkdtempSync(join(tmpdir(), 'hermes-run-store-'))
  process.env.HERMES_HOME = tempHome
})

afterEach(() => {
  if (tempHome) rmSync(tempHome, { recursive: true, force: true })
  tempHome = null
  if (originalHermesHome === undefined) delete process.env.HERMES_HOME
  else process.env.HERMES_HOME = originalHermesHome
  vi.resetModules()
})

describe('run-store persistence', () => {
  it('preserves concurrent updates to the same run', async () => {
    const { addRunLifecycleEvent, createPersistedRun, getPersistedRun } =
      await import('./run-store')

    await createPersistedRun({ runId: 'run-1', sessionKey: 'session-1' })

    const events = Array.from({ length: 24 }, (_, index) => ({
      text: `event-${index}`,
      emoji: '',
      timestamp: index,
      isError: false,
    }))

    await Promise.all(
      events.map((event) => addRunLifecycleEvent('session-1', 'run-1', event)),
    )

    const stored = await getPersistedRun('session-1', 'run-1')
    expect(stored?.lifecycleEvents.map((event) => event.text).sort()).toEqual(
      events.map((event) => event.text).sort(),
    )
  })

  it('exposes a recently completed run so returning UI can recover the final result', async () => {
    const {
      appendRunText,
      createPersistedRun,
      getActiveRunForSession,
      markRunStatus,
    } = await import('./run-store')

    await createPersistedRun({ runId: 'run-1', sessionKey: 'main' })
    await appendRunText('main', 'run-1', 'README.md', { replace: true })
    await markRunStatus('main', 'run-1', 'complete')

    const run = await getActiveRunForSession('main')
    expect(run?.status).toBe('complete')
    expect(run?.assistantText).toBe('README.md')
  })

  it('does not reopen a completed run when late thinking arrives', async () => {
    const { createPersistedRun, markRunStatus, setRunThinking, getPersistedRun } =
      await import('./run-store')

    await createPersistedRun({ runId: 'run-2', sessionKey: 'ops' })
    await markRunStatus('ops', 'run-2', 'complete')
    await setRunThinking('ops', 'run-2', 'late thinking')
    const stored = await getPersistedRun('ops', 'run-2')
    expect(stored?.status).toBe('complete')
  })

  it('completes leftover live Operations runs so the card can return to idle', async () => {
    const {
      createPersistedRun,
      completeLiveRunsForSession,
      getActiveRunForSession,
    } = await import('./run-store')

    await createPersistedRun({ runId: 'stale', sessionKey: 'agent:main:ops-framesengineering' })
    await completeLiveRunsForSession(
      'agent:main:ops-framesengineering',
      '1. /Users/brianackley/stormbot-os\n2. certified/stormbot-stable-2026-08-19\n3. 6f9b44d',
    )
    const run = await getActiveRunForSession('agent:main:ops-framesengineering')
    expect(run?.status).toBe('complete')
    expect(run?.assistantText).toContain('/Users/brianackley/stormbot-os')
  })
})
