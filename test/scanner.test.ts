import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { runRules } from '../src/rules/index.ts'
import { SCANNER_VERSION, scanDirectory } from '../src/scanner.ts'
import { analyze } from '../src/analyze.ts'

describe('scanner', () => {
  it('keeps SCANNER_VERSION in lockstep with package.json', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
    expect(SCANNER_VERSION).toBe(pkg.version)
  })

  it('grades the clean fixture A with only info findings', async () => {
    const report = await scanDirectory(new URL('../fixtures/clean-seams-declared', import.meta.url).pathname, {
      now: () => '2026-01-01T00:00:00.000Z',
    })
    expect(report.summary.grade).toBe('A')
    expect(report.findings.every((f) => f.severity === 'info')).toBe(true)
  })

  it('grades the kitchen-sink fixture D with high findings', async () => {
    const report = await scanDirectory(new URL('../fixtures/offender-kitchen-sink', import.meta.url).pathname, {
      now: () => '2026-01-01T00:00:00.000Z',
    })
    expect(report.summary.grade).toBe('D')
    expect(report.summary.counts.high).toBeGreaterThan(0)
    const ids = report.findings.map((f) => f.id)
    expect(ids).toContain('dep.install-scripts')
    expect(ids).toContain('dep.floating-range')
    expect(ids).toContain('dep.typosquat-proximity')
    expect(ids).toContain('obf.eval-detect')
    expect(ids).toContain('obf.dynamic-require')
    expect(ids).toContain('obf.encoded-payload')
    expect(ids).toContain('obf.charcode-chain')
    expect(ids).toContain('perm.undeclared-fs-write')
    expect(ids).toContain('perm.subprocess-spawn')
    expect(ids).toContain('perm.network-client')
    expect(ids).toContain('egress.secret-adjacent')
  })

  it('grades the destructive fixture F', async () => {
    const report = await scanDirectory(new URL('../fixtures/critical-destructive', import.meta.url).pathname, {
      now: () => '2026-01-01T00:00:00.000Z',
    })
    expect(report.summary.grade).toBe('F')
    expect(report.findings.some((f) => f.id === 'perm.seam-mismatch')).toBe(true)
  })

  it('flags unreachable and unparseable files', async () => {
    const report = await scanDirectory(new URL('../fixtures/unreachable-unparseable', import.meta.url).pathname, {
      now: () => '2026-01-01T00:00:00.000Z',
    })
    const ids = report.findings.map((f) => f.id)
    expect(ids).toContain('perm.unreachable-files')
    expect(ids).toContain('obf.unparseable')
  })

  it('runs a rule subset and rejects unknown rule ids', () => {
    const analysis = analyze(new URL('../fixtures/offender-kitchen-sink', import.meta.url).pathname)
    const subset = runRules(analysis, ['dep.install-scripts'])
    expect(subset.every((f) => f.id === 'dep.install-scripts')).toBe(true)
    expect(() => runRules(analysis, ['no.such-rule'])).toThrow(/unknown rule id/)
  })
})
