// @vitest-environment jsdom
import React from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { WorkroomSurface } from './workroom'

const reactTestGlobal = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT: boolean
}
reactTestGlobal.IS_REACT_ACT_ENVIRONMENT = true

async function renderWorkroom() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await React.act(() => {
    root.render(<WorkroomSurface />)
  })
  return {
    container,
    unmount: async () => {
      await React.act(() => root.unmount())
      document.body.removeChild(container)
    },
  }
}

describe('WorkroomSurface', () => {
  it('embeds Claw3D with loading feedback and a separate-tab fallback', async () => {
    const { container, unmount } = await renderWorkroom()

    const iframe = container.querySelector<HTMLIFrameElement>(
      'iframe[title="Claw3D Workroom"]',
    )
    const openLink =
      container.querySelector<HTMLAnchorElement>('a[target="_blank"]')
    expect(iframe?.getAttribute('src')).toBe('http://127.0.0.1:3001/office')
    expect(container.textContent).toContain('Loading Claw3D')
    expect(openLink?.getAttribute('href')).toBe('http://127.0.0.1:3001/office')

    await React.act(() => iframe?.dispatchEvent(new Event('load')))
    expect(container.textContent).toContain('Claw3D loaded')
    await unmount()
  })

  it('reloads the embed on operator request', async () => {
    const { container, unmount } = await renderWorkroom()
    const firstIframe = container.querySelector(
      'iframe[title="Claw3D Workroom"]',
    )
    const reload = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Reload',
    )

    await React.act(() => reload?.click())
    const reloadedIframe = container.querySelector(
      'iframe[title="Claw3D Workroom"]',
    )
    expect(reloadedIframe).not.toBe(firstIframe)
    expect(container.textContent).toContain('Loading Claw3D')
    await unmount()
  })
})
