import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { assess } from '../examples/consumer/consume-report.mjs'
import { validateReport, coverageOf, renderMarkdown } from '../src/index.ts'

const api = { validateReport, coverageOf, renderMarkdown }
const DIR = fileURLToPath(new URL('../test/fixtures/conformance', import.meta.url))
const load = (name: string): object => JSON.parse(readFileSync(join(DIR, name), 'utf8'))

describe('consumer example', () => {
  it('valid report: coverage visible, markdown rendered, applicability honestly unsupported', () => {
    const out = assess(load('extension-v1.report.json'), api, { runUrl: 'https://example.com/run' })
    expect(out.valid).toBe(true)
    expect(out.issues).toEqual([])
    expect(out.coverage).toBe('complete')
    expect(out.markdown).toContain('Grade: A')
    expect(out.applicability).toContain('not supported')
  })

  it('legacy report: unknown coverage stays visible, still renders', () => {
    const out = assess(load('legacy-minimal.report.json'), api)
    expect(out.valid).toBe(true)
    expect(out.coverage).toBe('unknown')
    expect(out.markdown).toContain('coverage: unknown')
  })

  it('forged report: rejected, nothing rendered, issues listed, extension data intact', () => {
    const out = assess(load('forged-summary.report.json'), api)
    expect(out.valid).toBe(false)
    expect(out.issues.length).toBeGreaterThan(0)
    expect(out.markdown).toBe(null)
    expect(out.coverage).toBe('partial')
  })
})
