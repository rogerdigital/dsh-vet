import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { scanDirectory } from '../src/scanner.ts'

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
      if (process.env.GOLDEN_UPDATE || !existsSync(goldenPath)) {
        writeFileSync(goldenPath, json)
      }
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
