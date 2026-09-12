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

describe('run-store stale reconciliation', () => {
  const opsKey = 'agent:main:ops-framesengineering'

  async function loadStore() {
    const store = await import('./run-store')
    const tracker = await import('./send-run-tracker')
    tracker.resetActiveSendRunsForTests()
    return { store, tracker }
  }

  async function writeAgedRun(
    store: typeof import('./run-store'),
    input: {
      runId: string
      status: 'accepted' | 'active' | 'complete' | 'error'
      ageMs: number
      assistantText?: string
    },
  ) {
    const { mkdir, writeFile } = await import('node:fs/promises')
    const { join } = await import('node:path')
    await store.createPersistedRun({ runId: input.runId, sessionKey: opsKey })
    const current = await store.getPersistedRun(opsKey, input.runId)
    expect(current).toBeTruthy()
    const aged = {
      ...current!,
      status: input.status,
      assistantText: input.assistantText ?? current!.assistantText,
      updatedAt: Date.now() - input.ageMs,
      lastEventAt: Date.now() - input.ageMs,
    }
    const dir = join(
      process.env.HERMES_HOME!,
      'webui-mvp',
      'runs',
      encodeURIComponent(opsKey),
    )
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, `${input.runId}.json`), `${JSON.stringify(aged, null, 2)}\n`)
    return aged
  }

  it('keeps a fresh active run active', async () => {
    const { store } = await loadStore()
    await store.createPersistedRun({ runId: 'fresh-active', sessionKey: opsKey })
    await store.markRunStatus(opsKey, 'fresh-active', 'active')
    const run = await store.getActiveRunForSession(opsKey)
    expect(run?.runId).toBe('fresh-active')
    expect(run?.status).toBe('active')
    expect(await store.listActiveRuns()).toHaveLength(1)
  })

  it('keeps a live registered run active even if its file is old', async () => {
    const { store, tracker } = await loadStore()
    await writeAgedRun(store, {
      runId: 'live-registered',
      status: 'active',
      ageMs: 30 * 60 * 1000,
    })
    tracker.registerActiveSendRun('live-registered')
    const run = await store.getActiveRunForSession(opsKey)
    expect(run?.runId).toBe('live-registered')
    expect(run?.status).toBe('active')
    expect(await store.listActiveRuns()).toEqual([
      expect.objectContaining({ runId: 'live-registered', status: 'active' }),
    ])
  })

  it('recovers a stale accepted run without live execution', async () => {
    const { store } = await loadStore()
    await writeAgedRun(store, {
      runId: 'stale-accepted',
      status: 'accepted',
      ageMs: 20 * 60 * 1000,
      assistantText: 'keep this output',
    })
    const recovered = await store.reconcileStaleRuns(opsKey)
    expect(recovered[0]).toMatchObject({
      runId: 'stale-accepted',
      status: 'error',
      errorMessage: 'stale_run_recovered',
      assistantText: 'keep this output',
    })
    expect(await store.listActiveRuns()).toEqual([])
    const stored = await store.getPersistedRun(opsKey, 'stale-accepted')
    expect(stored?.status).toBe('error')
    expect(stored?.assistantText).toBe('keep this output')
  })

  it('recovers a stale active run without live execution', async () => {
    const { store } = await loadStore()
    await writeAgedRun(store, {
      runId: 'stale-active',
      status: 'active',
      ageMs: 20 * 60 * 1000,
    })
    await store.listActiveRuns()
    const stored = await store.getPersistedRun(opsKey, 'stale-active')
    expect(stored).toMatchObject({
      status: 'error',
      errorMessage: 'stale_run_recovered',
    })
  })

  it('leaves a terminal run terminal', async () => {
    const { store } = await loadStore()
    await store.createPersistedRun({ runId: 'done', sessionKey: opsKey })
    await store.markRunStatus(opsKey, 'done', 'complete')
    await store.reconcileStaleRuns(opsKey)
    const stored = await store.getPersistedRun(opsKey, 'done')
    expect(stored?.status).toBe('complete')
    expect(stored?.errorMessage).toBeUndefined()
  })

  it('does not let two abandoned Operations runs block the next send', async () => {
    const { store } = await loadStore()
    await writeAgedRun(store, {
      runId: 'abandoned-1',
      status: 'active',
      ageMs: 15 * 60 * 1000,
    })
    await writeAgedRun(store, {
      runId: 'abandoned-2',
      status: 'accepted',
      ageMs: 12 * 60 * 1000,
    })
    expect(await store.listActiveRuns()).toEqual([])
    expect(await store.getActiveRunForSession(opsKey)).toBeNull()

    await store.createPersistedRun({ runId: 'next-send', sessionKey: opsKey })
    const live = await store.getActiveRunForSession(opsKey)
    expect(live?.runId).toBe('next-send')
    expect(live?.status).toBe('accepted')
    expect((await store.listActiveRuns()).map((run) => run.runId)).toEqual([
      'next-send',
    ])
  })
})
