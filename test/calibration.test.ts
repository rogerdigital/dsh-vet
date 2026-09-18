import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { scanDirectory } from '../src/scanner.ts'
import { compareReports } from '../src/compare.ts'
import type { VetReport } from '../src/contract.ts'

const CASES_DIR = fileURLToPath(new URL('../test/fixtures/calibration', import.meta.url))
const FIXED_NOW = () => '2026-01-01T00:00:00.000Z'
const KINDS = ['benign', 'detection', 'transform-base', 'transform-variant', 'regression'] as const

interface CaseManifest {
  id: string
  kind: (typeof KINDS)[number]
  source: string
  license: string
  since: string
  expectedGrade: string
  expectedFindings?: Array<{ rule: string; file: string }>
  absentFindings?: Array<{ rule: string; file: string }>
  forbiddenRules?: string[]
  compareWith?: string
  rationale: string
  limitations?: string
}

function caseDirs(): string[] {
  return readdirSync(CASES_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
}

function loadManifest(name: string): CaseManifest {
  return JSON.parse(readFileSync(join(CASES_DIR, name, 'case.json'), 'utf8')) as CaseManifest
}

type WithContext = VetReport & {
  'x-dsh-vet'?: { findingIdentities?: Array<{ rule: string; file: string }> }
}

function identityKeys(report: WithContext): string[] {
  return (report['x-dsh-vet']?.findingIdentities ?? []).map((i) => `${i.rule}|${i.file}`)
}

describe('calibration corpus', () => {
  it('has cases to check', () => {
    expect(caseDirs().length).toBeGreaterThanOrEqual(1)
  })

  for (const name of caseDirs()) {
    const manifest = loadManifest(name)
    describe(name, () => {
      it('manifest is complete and honest', () => {
        expect(manifest.id).toBe(name)
        expect(KINDS).toContain(manifest.kind)
        for (const key of ['source', 'license', 'rationale'] as const) {
          expect(typeof manifest[key], `${name}.${key}`).toBe('string')
          expect((manifest[key] as string).length, `${name}.${key}`).toBeGreaterThan(10)
        }
        expect(manifest.since, `${name}.since`).toMatch(/^(\d+\.\d+\.\d+|unreleased)$/)
      })

      it('scanner outcome matches the published expectation', async () => {
        const report = (await scanDirectory(join(CASES_DIR, name), { now: FIXED_NOW })) as WithContext
        const ids = identityKeys(report)
        for (const expected of manifest.expectedFindings ?? []) {
          expect(ids, `${expected.rule} must fire in ${expected.file}`).toContain(`${expected.rule}|${expected.file}`)
        }
        for (const absent of manifest.absentFindings ?? []) {
          expect(ids, `${absent.rule} must NOT fire in ${absent.file}`).not.toContain(`${absent.rule}|${absent.file}`)
        }
        const rules = new Set(ids.map((id) => id.split('|')[0]))
        for (const forbidden of manifest.forbiddenRules ?? []) {
          expect(rules.has(forbidden), `${forbidden} must not appear anywhere in ${name}`).toBe(false)
        }
        expect(report.summary.grade).toBe(manifest.expectedGrade)
      })

      if (manifest.kind === 'transform-variant') {
        it('reformatting adds no risk deltas', async () => {
          expect(typeof manifest.compareWith).toBe('string')
          const base = (await scanDirectory(join(CASES_DIR, manifest.compareWith!), { now: FIXED_NOW })) as WithContext
          const head = (await scanDirectory(join(CASES_DIR, name), { now: FIXED_NOW })) as WithContext
          const diff = compareReports(base, head)
          expect(diff.comparability).toBe('comparable')
          expect(diff.reasons).toEqual([])
          expect(diff.findings.added).toEqual([])
          expect(diff.findings.removed).toEqual([])
          expect(diff.findings.changed).toEqual([])
          expect(diff.observations.added).toEqual([])
        })
      }
    })
  }
})
