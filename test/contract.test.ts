import { describe, expect, it } from 'vitest'
import {
  RULE_ID_PATTERN,
  SCHEMA_ID,
  countFindings,
  createReport,
  gradeFor,
} from '../src/contract.ts'
import type { VetFinding } from '../src/contract.ts'

const scanner = { name: 'dsh-vet', version: '0.0.0', ranAt: '2026-08-29T00:00:00Z' }
const target = { kind: 'npm-package' as const, specifier: 'fixture-plugin@1.2.3' }

function finding(overrides: Partial<VetFinding>): VetFinding {
  return {
    id: 'perm.broad-fs-write',
    title: 'fixture finding',
    severity: 'medium',
    confidence: 'high',
    evidence: [{ file: 'host-half.js' }],
    ...overrides,
  }
}

describe('gradeFor', () => {
  it('grades an empty report A', () => {
    expect(gradeFor([])).toBe('A')
  })

  it('walks the severity ladder: low B, medium C, high D, critical F', () => {
    expect(gradeFor([finding({ severity: 'low' })])).toBe('B')
    expect(gradeFor([finding({ severity: 'medium' })])).toBe('C')
    expect(gradeFor([finding({ severity: 'high' })])).toBe('D')
    expect(gradeFor([finding({ severity: 'critical' })])).toBe('F')
  })

  it('lets the worst graded severity decide', () => {
    const findings = [
      finding({ id: 'dep.unpinned', severity: 'low' }),
      finding({ id: 'perm.broad-fs-write', severity: 'high' }),
    ]
    expect(gradeFor(findings)).toBe('D')
  })

  it('never lowers a grade for low-confidence findings', () => {
    const findings = [
      finding({ id: 'egress.suspicious', severity: 'critical', confidence: 'low' }),
      finding({ id: 'dep.unpinned', severity: 'low', confidence: 'medium' }),
    ]
    expect(gradeFor(findings)).toBe('B')
  })

  it('never lowers a grade for info severity', () => {
    expect(gradeFor([finding({ id: 'meta.no-license', severity: 'info' })])).toBe('A')
  })
})

describe('createReport', () => {
  it('derives the summary and stamps the schema id', () => {
    const report = createReport({
      target,
      scanner,
      findings: [
        finding({ id: 'meta.no-license', severity: 'info' }),
        finding({ id: 'perm.broad-fs-write', severity: 'high' }),
      ],
    })
    expect(report.schema).toBe(SCHEMA_ID)
    expect(report.summary.grade).toBe('D')
    expect(report.summary.counts).toEqual({ critical: 0, high: 1, medium: 0, low: 0, info: 1 })
  })

  it('sorts findings deterministically: worst severity first, then id', () => {
    const report = createReport({
      target,
      scanner,
      findings: [
        finding({ id: 'dep.unpinned', severity: 'low' }),
        finding({ id: 'egress.endpoint-reach', severity: 'high' }),
        finding({ id: 'perm.broad-fs-write', severity: 'high' }),
      ],
    })
    expect(report.findings.map((f) => f.id)).toEqual([
      'egress.endpoint-reach',
      'perm.broad-fs-write',
      'dep.unpinned',
    ])
  })

  it('accepts vendor-prefixed multi-segment rule ids', () => {
    expect(() =>
      createReport({ target, scanner, findings: [finding({ id: 'acme.eval-detect' })] }),
    ).not.toThrow()
    expect(RULE_ID_PATTERN.test('perm.broad-fs-write')).toBe(true)
  })

  it('rejects invalid rule ids', () => {
    for (const id of ['bare', 'Has Upper', 'trailing.', '']) {
      expect(() => createReport({ target, scanner, findings: [finding({ id })] })).toThrow(/rule id/)
    }
  })

  it('counts every severity bucket independently of grading', () => {
    const counts = countFindings([
      finding({ id: 'a.b', severity: 'critical', confidence: 'low' }),
      finding({ id: 'c.d', severity: 'info' }),
    ])
    expect(counts).toEqual({ critical: 1, high: 0, medium: 0, low: 0, info: 1 })
  })
})
