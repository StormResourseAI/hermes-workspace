import { describe, expect, it } from 'vitest'
import { MOBILE_HAMBURGER_NAV_ITEMS } from './mobile-hamburger-menu'
import { MOBILE_NAV_TABS } from './mobile-tab-bar'
import { DESKTOP_SIDEBAR_BACKDROP_CLASS } from './workspace-shell'

describe('workspace shell sidebar backdrop', () => {
  it('only spans the desktop sidebar width, not the full viewport', () => {
    expect(DESKTOP_SIDEBAR_BACKDROP_CLASS).toContain('w-[300px]')
    expect(DESKTOP_SIDEBAR_BACKDROP_CLASS).not.toContain('inset-0')
  })
})

describe('swarm2 navigation alias handling', () => {
  it('keeps /swarm as the only user-visible swarm entry in the mobile hamburger menu', () => {
    const swarm = MOBILE_HAMBURGER_NAV_ITEMS.find((item) => item.id === 'swarm')
    const swarm2 = MOBILE_HAMBURGER_NAV_ITEMS.find(
      (item) => item.id === 'swarm2',
    )

    expect(swarm?.to).toBe('/swarm')
    expect(swarm2).toBeUndefined()
  })

  it('keeps /swarm as the only user-visible swarm tab', () => {
    const swarm = MOBILE_NAV_TABS.find((item) => item.id === 'swarm')
    const swarm2 = MOBILE_NAV_TABS.find((item) => item.id === 'swarm2')

    expect(swarm?.to).toBe('/swarm')
    expect(swarm2).toBeUndefined()
  })
})

describe('FRAMES Engineering navigation', () => {
  it('keeps the existing operations route and exposes the product label on mobile', () => {
    const hamburgerItem = MOBILE_HAMBURGER_NAV_ITEMS.find(
      (item) => item.id === 'operations',
    )
    const tabItem = MOBILE_NAV_TABS.find((item) => item.id === 'operations')

    expect(hamburgerItem).toMatchObject({
      to: '/operations',
      label: 'FRAMES Engineering',
    })
    expect(tabItem).toMatchObject({
      to: '/operations',
      label: 'FRAMES Engineering',
    })
  })

  it('keeps Workroom available from the mobile hamburger menu', () => {
    expect(
      MOBILE_HAMBURGER_NAV_ITEMS.find((item) => item.id === 'workroom'),
    ).toMatchObject({ to: '/workroom', label: 'Workroom' })
  })
})
