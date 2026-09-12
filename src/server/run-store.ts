import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { getHermesRoot } from './claude-paths'
import { hasActiveSendRun } from './send-run-tracker'

export type PersistedRunToolCall = {
  id: string
  name: string
  phase: string
  args?: unknown
  preview?: string
  result?: string
}

export type PersistedRunLifecycleEvent = {
  text: string
  emoji: string
  timestamp: number
  isError: boolean
}

export type PersistedRunState = {
  runId: string
  sessionKey: string
  friendlyId: string
  status: 'accepted' | 'active' | 'handoff' | 'stalled' | 'complete' | 'error'
  createdAt: number
  updatedAt: number
  lastEventAt: number
  assistantText: string
  thinkingText: string
  toolCalls: Array<PersistedRunToolCall>
  lifecycleEvents: Array<PersistedRunLifecycleEvent>
  errorMessage?: string
}

const RUNS_ROOT = path.join(getHermesRoot(), 'webui-mvp', 'runs')
const runUpdateQueues = new Map<string, Promise<void>>()

function encodeSessionKey(sessionKey: string): string {
  return encodeURIComponent(sessionKey || 'main')
}

function sessionDir(sessionKey: string): string {
  return path.join(RUNS_ROOT, encodeSessionKey(sessionKey))
}

function runPath(sessionKey: string, runId: string): string {
  return path.join(sessionDir(sessionKey), `${runId}.json`)
}

async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true })
}

async function writeRun(run: PersistedRunState): Promise<void> {
  const dir = sessionDir(run.sessionKey)
  await ensureDir(dir)
  const targetPath = runPath(run.sessionKey, run.runId)
  const tempPath = `${targetPath}.${process.pid}.${Date.now()}.${Math.random()
    .toString(36)
    .slice(2)}.tmp`
  await writeFile(tempPath, `${JSON.stringify(run, null, 2)}\n`, 'utf8')
  await rename(tempPath, targetPath)
}

async function enqueueRunUpdate<T>(
  sessionKey: string,
  runId: string,
  work: () => Promise<T>,
): Promise<T> {
  const key = `${encodeSessionKey(sessionKey)}:${runId}`
  const previous = runUpdateQueues.get(key) ?? Promise.resolve()
  const current = previous.catch(() => undefined).then(work)
  const marker = current.then(
    () => undefined,
    () => undefined,
  )
  runUpdateQueues.set(key, marker)
  try {
    return await current
  } finally {
    if (runUpdateQueues.get(key) === marker) {
      runUpdateQueues.delete(key)
    }
  }
}

export async function createPersistedRun(input: {
  runId: string
  sessionKey: string
  friendlyId?: string
}): Promise<PersistedRunState> {
  const now = Date.now()
  const run: PersistedRunState = {
    runId: input.runId,
    sessionKey: input.sessionKey,
    friendlyId: input.friendlyId || input.sessionKey,
    status: 'accepted',
    createdAt: now,
    updatedAt: now,
    lastEventAt: now,
    assistantText: '',
    thinkingText: '',
    toolCalls: [],
    lifecycleEvents: [],
  }
  await writeRun(run)
  return run
}

export async function getPersistedRun(
  sessionKey: string,
  runId: string,
): Promise<PersistedRunState | null> {
  try {
    const raw = await readFile(runPath(sessionKey, runId), 'utf8')
    return JSON.parse(raw) as PersistedRunState
  } catch {
    return null
  }
}

export async function updatePersistedRun(
  sessionKey: string,
  runId: string,
  updater: (run: PersistedRunState) => PersistedRunState,
): Promise<PersistedRunState | null> {
  return enqueueRunUpdate(sessionKey, runId, async () => {
    const current = await getPersistedRun(sessionKey, runId)
    if (!current) return null
    const next = updater(current)
    next.updatedAt = Date.now()
    await writeRun(next)
    return next
  })
}

export const STALE_RUN_THRESHOLD_MS = 5 * 60 * 1000
export const RECENT_COMPLETE_WINDOW_MS = 2 * 60 * 1000
export const STALE_RUN_RECOVERY_REASON = 'stale_run_recovered'

export function isTerminalRunStatus(
  status: PersistedRunState['status'] | string | null | undefined,
): boolean {
  return status === 'complete' || status === 'error'
}

export function isLivePersistedRun(
  run: Pick<PersistedRunState, 'runId' | 'status' | 'updatedAt'>,
  now = Date.now(),
): boolean {
  if (isTerminalRunStatus(run.status)) return false
  if (hasActiveSendRun(run.runId)) return true
  return now - run.updatedAt < STALE_RUN_THRESHOLD_MS
}

function runHasVisibleResult(run: PersistedRunState): boolean {
  return Boolean((run.assistantText || '').trim())
}

export async function appendRunText(
  sessionKey: string,
  runId: string,
  text: string,
  options?: { replace?: boolean },
): Promise<PersistedRunState | null> {
  return updatePersistedRun(sessionKey, runId, (run) => {
    if (isTerminalRunStatus(run.status)) return run
    return {
      ...run,
      status: 'active',
      lastEventAt: Date.now(),
      assistantText: options?.replace ? text : `${run.assistantText}${text}`,
    }
  })
}

export async function setRunThinking(
  sessionKey: string,
  runId: string,
  thinkingText: string,
): Promise<PersistedRunState | null> {
  return updatePersistedRun(sessionKey, runId, (run) => {
    if (isTerminalRunStatus(run.status)) return run
    return {
      ...run,
      status: 'active',
      lastEventAt: Date.now(),
      thinkingText,
    }
  })
}

export async function upsertRunToolCall(
  sessionKey: string,
  runId: string,
  toolCall: PersistedRunToolCall,
): Promise<PersistedRunState | null> {
  return updatePersistedRun(sessionKey, runId, (run) => {
    const nextToolCalls = [...run.toolCalls]
    const idx = nextToolCalls.findIndex((entry) => entry.id === toolCall.id)
    if (idx >= 0) nextToolCalls[idx] = { ...nextToolCalls[idx], ...toolCall }
    else nextToolCalls.push(toolCall)
    return {
      ...run,
      status: toolCall.phase === 'error' ? 'error' : 'active',
      lastEventAt: Date.now(),
      toolCalls: nextToolCalls,
      ...(toolCall.phase === 'error' && toolCall.result
        ? { errorMessage: toolCall.result }
        : {}),
    }
  })
}

export async function addRunLifecycleEvent(
  sessionKey: string,
  runId: string,
  event: PersistedRunLifecycleEvent,
): Promise<PersistedRunState | null> {
  return updatePersistedRun(sessionKey, runId, (run) => ({
    ...run,
    lastEventAt: Date.now(),
    lifecycleEvents: [...run.lifecycleEvents, event].slice(-40),
  }))
}

export async function markRunStatus(
  sessionKey: string,
  runId: string,
  status: PersistedRunState['status'],
  errorMessage?: string,
): Promise<PersistedRunState | null> {
  return updatePersistedRun(sessionKey, runId, (run) => ({
    ...run,
    status,
    lastEventAt: Date.now(),
    ...(errorMessage ? { errorMessage } : {}),
  }))
}

export async function completeLiveRunsForSession(
  sessionKey: string,
  assistantText?: string,
): Promise<void> {
  const runs = await readRunsInDir(sessionDir(sessionKey)).catch(() => [])
  await Promise.all(
    runs
      .filter((run) => !isTerminalRunStatus(run.status))
      .map((run) =>
        updatePersistedRun(sessionKey, run.runId, (current) => ({
          ...current,
          status: 'complete',
          lastEventAt: Date.now(),
          assistantText:
            assistantText?.trim() || current.assistantText || current.thinkingText,
        })),
      ),
  )
}

async function recoverStaleRun(
  run: PersistedRunState,
): Promise<PersistedRunState | null> {
  return updatePersistedRun(run.sessionKey, run.runId, (current) => {
    if (isTerminalRunStatus(current.status) || isLivePersistedRun(current)) {
      return current
    }
    return {
      ...current,
      status: 'error',
      errorMessage: STALE_RUN_RECOVERY_REASON,
      lastEventAt: Date.now(),
    }
  })
}

export async function reconcileStaleRuns(
  sessionKey?: string,
): Promise<Array<PersistedRunState>> {
  const runs = sessionKey
    ? await readRunsInDir(sessionDir(sessionKey)).catch(() => [])
    : await readAllPersistedRuns()
  const recovered: Array<PersistedRunState> = []
  for (const run of runs) {
    if (isTerminalRunStatus(run.status) || isLivePersistedRun(run)) continue
    const next = await recoverStaleRun(run)
    if (next) recovered.push(next)
  }
  return recovered
}

async function readAllPersistedRuns(): Promise<Array<PersistedRunState>> {
  try {
    const entries = await readdir(RUNS_ROOT, { withFileTypes: true })
    const sessionDirs = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(RUNS_ROOT, entry.name))
    const runsBySession = await Promise.all(sessionDirs.map(readRunsInDir))
    return runsBySession.flat()
  } catch {
    return []
  }
}

async function readRunsInDir(dir: string): Promise<Array<PersistedRunState>> {
  const files = (await readdir(dir)).filter((name) => name.endsWith('.json'))
  if (files.length === 0) return []
  const runs = await Promise.all(
    files.map(async (name) => {
      try {
        const raw = await readFile(path.join(dir, name), 'utf8')
        return JSON.parse(raw) as PersistedRunState
      } catch {
        return null
      }
    }),
  )
  return runs.filter((run): run is PersistedRunState => Boolean(run))
}

export async function getActiveRunForSession(
  sessionKey: string,
): Promise<PersistedRunState | null> {
  try {
    await reconcileStaleRuns(sessionKey)
    const runs = await readRunsInDir(sessionDir(sessionKey))
    const now = Date.now()
    const candidates = runs
      .filter((run) => {
        if (isTerminalRunStatus(run.status)) {
          if (run.errorMessage === STALE_RUN_RECOVERY_REASON) return false
          return now - run.updatedAt < RECENT_COMPLETE_WINDOW_MS
        }
        return isLivePersistedRun(run, now)
      })
      .sort((a, b) => {
        const aHasResult = Boolean(runHasVisibleResult(a))
        const bHasResult = Boolean(runHasVisibleResult(b))
        const aLive = isLivePersistedRun(a, now) && !aHasResult
        const bLive = isLivePersistedRun(b, now) && !bHasResult
        if (aLive !== bLive) return aLive ? -1 : 1
        if (aHasResult !== bHasResult) return aHasResult ? -1 : 1
        return b.updatedAt - a.updatedAt
      })
    return candidates[0] ?? null
  } catch {
    return null
  }
}

export async function listActiveRuns(): Promise<Array<PersistedRunState>> {
  await reconcileStaleRuns()
  const runs = await readAllPersistedRuns()
  return runs
    .filter((run) => isLivePersistedRun(run))
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function listAllActiveRuns(): Promise<Array<PersistedRunState>> {
  return listActiveRuns()
}
