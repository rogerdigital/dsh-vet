import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { validateReport } from '../src/validate.ts'
import { checkScanContext, coverageOf } from '../src/scan-context.ts'
import { compareReports } from '../src/compare.ts'
import { renderMarkdown } from '../src/render.ts'

const DIR = fileURLToPath(new URL('../test/fixtures/conformance', import.meta.url))
const load = (name: string): object => JSON.parse(readFileSync(join(DIR, name), 'utf8'))

describe('conformance corpus', () => {
  it('legacy report: valid, unknown coverage, never comparison metadata', () => {
    const report = load('legacy-minimal.report.json')
    expect(validateReport(report).ok).toBe(true)
    expect(coverageOf(report)).toBe('unknown')
    const diff = compareReports(report, load('extension-v1.report.json'))
    expect(diff.comparability).toBe('incomparable')
    expect(diff.reasons).toContain('context-absent-base')
  })

  it('extension v1: valid, complete coverage, renders with coverage stated', () => {
    const report = load('extension-v1.report.json')
    expect(validateReport(report).ok).toBe(true)
    expect(checkScanContext(report).state).toBe('validated')
    expect(coverageOf(report)).toBe('complete')
    expect(renderMarkdown(report, { runUrl: 'https://example.com/run' })).toContain('coverage: complete')
  })

  it('forged summary: rejected — the summary is derived, never asserted', () => {
    const result = validateReport(load('forged-summary.report.json'))
    expect(result.ok).toBe(false)
    expect(result.issues.some((i) => i.path === 'summary.grade')).toBe(true)
  })

  it('forged summary over intact context: coverage data survives validation failure', () => {
    const report = load('forged-summary.report.json')
    expect(coverageOf(report)).toBe('partial')
  })

  it('partial coverage: valid but visibly partial, and never comparison-grade', () => {
    const report = load('partial-coverage.report.json')
    expect(validateReport(report).ok).toBe(true)
    expect(coverageOf(report)).toBe('partial')
    const diff = compareReports(load('pair-a-base.report.json'), report)
    expect(diff.comparability).toBe('incomparable')
    expect(diff.reasons).toContain('coverage-partial-head')
  })

  it('future extension: valid base report, unsupported context, never trusted', () => {
    const report = load('future-extension.report.json')
    expect(validateReport(report).ok).toBe(true)
    expect(checkScanContext(report)).toEqual({ state: 'unsupported', version: 2 })
    expect(coverageOf(report)).toBe('unknown')
    const diff = compareReports(load('pair-a-base.report.json'), report)
    expect(diff.comparability).toBe('incomparable')
    expect(diff.reasons).toContain('context-unsupported-head')
  })

  it('same profile, different ranAt: comparable, zero deltas', () => {
    const diff = compareReports(load('pair-a-base.report.json'), load('pair-a-head.report.json'))
    expect(diff.comparability).toBe('comparable')
    expect(diff.reasons).toEqual([])
    expect(diff.findings.added).toEqual([])
    expect(diff.findings.removed).toEqual([])
    expect(diff.findings.changed).toEqual([])
  })

  it('different rule profile: incomparable with the exact reason', () => {
    const diff = compareReports(load('pair-a-base.report.json'), load('pair-b-head.report.json'))
    expect(diff.comparability).toBe('incomparable')
    expect(diff.reasons).toContain('profile-mismatch')
  })
})
