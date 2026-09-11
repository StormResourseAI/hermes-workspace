import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('router route generation invalidation', () => {
  it('does not tell Vite to ignore the generated TanStack route tree', () => {
    const viteConfig = readFileSync(resolve(process.cwd(), 'vite.config.ts'), 'utf8')

    expect(viteConfig).not.toContain("'**/routeTree.gen.ts'")
    expect(viteConfig).not.toContain('"**/routeTree.gen.ts"')
  })

  it('binds the Vite dev server to loopback and detaches TTY stdin in serve mode', () => {
    const viteConfig = readFileSync(resolve(process.cwd(), 'vite.config.ts'), 'utf8')
    expect(viteConfig).toContain("host: process.env.HOST?.trim() || env.HOST?.trim() || '127.0.0.1'")
    expect(viteConfig).toContain('process.stdin.pause()')
    expect(viteConfig).not.toMatch(/host:\s*'0\.0\.0\.0'/)
  })
})
