import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { usePageTitle } from '@/hooks/use-page-title'

const claw3dUrl = (
  import.meta.env.VITE_CLAW3D_URL || 'http://127.0.0.1:3001'
).replace(/\/$/, '')

type WorkroomLoadState = 'loading' | 'loaded' | 'failed'

export function WorkroomSurface() {
  const [attempt, setAttempt] = useState(0)
  const [loadState, setLoadState] = useState<WorkroomLoadState>('loading')
  const officeUrl = `${claw3dUrl}/office`

  const retry = () => {
    setLoadState('loading')
    setAttempt((current) => current + 1)
  }

  return (
    <main className="flex h-full min-h-[640px] flex-col overflow-hidden bg-surface text-primary-900">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-primary-200 bg-primary-50/80 px-4 py-3 md:px-5">
        <div>
          <h1 className="text-base font-semibold">Workroom</h1>
          <p className="mt-0.5 text-xs text-primary-600">
            Claw3D visual agent workspace · operational truth remains in FRAMES
            Engineering
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            aria-live="polite"
            className="inline-flex items-center gap-2 rounded-full border border-primary-200 bg-surface px-3 py-1.5 text-xs text-primary-600"
          >
            <span
              className={`size-2 rounded-full ${
                loadState === 'loaded'
                  ? 'bg-emerald-500'
                  : loadState === 'failed'
                    ? 'bg-red-500'
                    : 'animate-pulse bg-amber-500'
              }`}
            />
            {loadState === 'loaded'
              ? 'Claw3D loaded'
              : loadState === 'failed'
                ? 'Embed unavailable'
                : 'Loading Claw3D'}
          </span>
          <button
            type="button"
            onClick={retry}
            className="rounded-lg border border-primary-200 bg-surface px-3 py-1.5 text-xs font-medium text-primary-700 transition-colors hover:bg-primary-100"
          >
            Reload
          </button>
          <a
            href={officeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg bg-accent-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-600"
          >
            Open separately ↗
          </a>
        </div>
      </header>

      <section className="relative min-h-0 flex-1">
        {loadState !== 'failed' && (
          <iframe
            key={attempt}
            src={officeUrl}
            title="Claw3D Workroom"
            onLoad={() => setLoadState('loaded')}
            onError={() => setLoadState('failed')}
            className="h-full min-h-[560px] w-full border-0"
            allow="fullscreen"
            allowFullScreen
            referrerPolicy="origin"
          />
        )}

        {loadState === 'loading' && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-surface/90">
            <div className="text-center">
              <div className="mx-auto mb-3 size-8 animate-spin rounded-full border-4 border-accent-500 border-r-transparent" />
              <p className="text-sm text-primary-600">
                Loading the Claw3D visual workspace…
              </p>
            </div>
          </div>
        )}

        {loadState === 'failed' && (
          <div className="flex h-full min-h-[560px] items-center justify-center px-6 text-center">
            <div className="max-w-md rounded-2xl border border-primary-200 bg-primary-50 p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-primary-900">
                Workroom embed unavailable
              </h2>
              <p className="mt-2 text-sm text-primary-600">
                Claw3D could not load inside Hermes Workspace. Retry the embed
                or open the certified office in a separate tab.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={retry}
                  className="rounded-lg border border-primary-200 bg-surface px-4 py-2 text-sm font-medium text-primary-700 transition-colors hover:bg-primary-100"
                >
                  Retry embed
                </button>
                <a
                  href={officeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg bg-accent-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-600"
                >
                  Open separately ↗
                </a>
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  )
}

function WorkroomRoute() {
  usePageTitle('Workroom')
  return <WorkroomSurface />
}

export const Route = createFileRoute('/workroom')({
  component: WorkroomRoute,
})
