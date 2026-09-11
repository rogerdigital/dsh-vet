import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { scanDirectory } from '../src/scanner.ts'
import { compareReports } from '../src/compare.ts'
import { coverageOf } from '../src/scan-context.ts'
import { validateReport } from '../src/validate.ts'

const FIXTURES_DIR = fileURLToPath(new URL('../fixtures', import.meta.url))
const FIXED_NOW = '2026-01-01T00:00:00.000Z'

function fixtureDirs(): string[] {
  return readdirSync(FIXTURES_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
}

describe('golden reports', () => {
  for (const name of fixtureDirs()) {
    it(`matches the committed golden for ${name}`, async () => {
      const report = await scanDirectory(join(FIXTURES_DIR, name), { now: () => FIXED_NOW })
      // The only machine-specific field in a local-path report is the absolute
      // path; goldens carry a stable placeholder instead.
      report.target.specifier = `<fixture:${name}>`
      const json = JSON.stringify(report, null, 2) + '\n'
      const goldenPath = join(FIXTURES_DIR, name, 'expected.report.json')
      // A missing golden is a failure, not an implicit snapshot: new fixtures
      // must be generated deliberately via `pnpm test:update-goldens` and the
      // resulting diff reviewed.
      if (process.env.GOLDEN_UPDATE) {
        writeFileSync(goldenPath, json)
      }
      expect(existsSync(goldenPath), `${goldenPath} is missing — run pnpm test:update-goldens and review the diff`).toBe(true)
      expect(readFileSync(goldenPath, 'utf8')).toBe(json)
    })
  }

  it('is deterministic across repeated runs of the same fixture', async () => {
    const dir = join(FIXTURES_DIR, 'offender-kitchen-sink')
    const first = await scanDirectory(dir, { now: () => FIXED_NOW })
    const second = await scanDirectory(dir, { now: () => FIXED_NOW })
    first.target.specifier = '<fixture:offender-kitchen-sink>'
    second.target.specifier = '<fixture:offender-kitchen-sink>'
    expect(JSON.stringify(first)).toBe(JSON.stringify(second))
  })
})

describe('release-risk controlled pair', () => {
  // Two committed reports over controlled content: identical except one
  // added outbound host. The pair anchors the M1 acceptance matrix — the
  // comparison must stay comparable with exactly that delta, and both
  // reports must keep validating as the contract evolves.
  const PAIR_DIR = new URL('../test/fixtures/release-risk/', import.meta.url)
  const base = JSON.parse(readFileSync(new URL('./controlled-pair-base.report.json', PAIR_DIR), 'utf8'))
  const head = JSON.parse(readFileSync(new URL('./controlled-pair-head.report.json', PAIR_DIR), 'utf8'))

  it('both pair reports still validate against the current contract', () => {
    expect(validateReport(base).issues).toEqual([])
    expect(validateReport(head).issues).toEqual([])
  })

  it('compares as comparable with exactly the added-host delta', () => {
    const diff = compareReports(base, head)
    expect(diff.comparability).toBe('comparable')
    expect(diff.reasons).toEqual([])
    expect(diff.findings.added.map((i) => `${i.rule}|${i.file}|${i.subject}`)).toEqual([
      'egress.outbound-endpoints|index.js|b.example.com',
      'perm.network-client|index.js|b.example.com',
    ])
    expect(diff.findings.removed).toEqual([])
    expect(diff.findings.changed).toEqual([])
    expect(diff.observations.added.map((o) => `${o.kind}|${o.file}|${o.subject}`)).toEqual([
      'outbound-host|index.js|b.example.com',
    ])
    expect(diff.base.grade).toBe(diff.head.grade)
  })

  it('the legacy compatibility fixture stays valid and unknown-coverage', () => {
    const legacy = JSON.parse(readFileSync(new URL('./legacy-no-extensions.report.json', PAIR_DIR), 'utf8'))
    expect(validateReport(legacy).issues).toEqual([])
    expect(coverageOf(legacy)).toBe('unknown')
  })
})
