import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SCANNER_VERSION, scanDirectory } from '../src/scanner.ts'
import { compareReports } from '../src/compare.ts'
import { renderDiffText } from '../src/render-diff.ts'
import type { VetDiff } from '../src/compare.ts'

const NOW = () => '2026-01-01T00:00:00.000Z'

function fixture(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-vet-rd-'))
  for (const [path, content] of Object.entries(files)) {
    const abs = join(dir, path)
    mkdirSync(join(abs, '..'), { recursive: true })
    writeFileSync(abs, content)
  }
  return dir
}

async function diffOf(baseFiles: Record<string, string>, headFiles: Record<string, string>): Promise<VetDiff> {
  const baseDir = fixture(baseFiles)
  const headDir = fixture(headFiles)
  try {
    const base = await scanDirectory(baseDir, { now: NOW })
    const head = await scanDirectory(headDir, { now: NOW })
    return compareReports(base, head, { subjectLabel: 'demo' })
  } finally {
    rmSync(baseDir, { recursive: true, force: true })
    rmSync(headDir, { recursive: true, force: true })
  }
}

const PKG = '{"name":"demo","main":"index.js"}'

describe('renderDiffText', () => {
  it('leads with comparability, both subjects, and added behavior; grade comes last', async () => {
    const text = renderDiffText(
      await diffOf(
        { 'package.json': PKG, 'index.js': "await fetch('https://a.example.com/x')" },
        {
          'package.json': PKG,
          'index.js': "await fetch('https://a.example.com/x')\nawait fetch('https://b.example.com/y')",
        },
      ),
    )
    const lines = text.split('\n')
    expect(lines[0]).toBe('dsh-vet diff · comparable')
    expect(lines[1]!.startsWith(`base: dsh-vet ${SCANNER_VERSION} · grade C · demo · sha256:`)).toBe(true)
    expect(lines[2]!.startsWith(`head: dsh-vet ${SCANNER_VERSION} · grade C · demo · sha256:`)).toBe(true)
    const addedIndex = text.indexOf('added findings')
    const gradeIndex = text.indexOf('grade: C → C (secondary context)')
    expect(addedIndex).toBeGreaterThan(-1)
    expect(gradeIndex).toBeGreaterThan(addedIndex)
    expect(text).toContain('egress.outbound-endpoints · endpoints · index.js · b.example.com')
    expect(text).toContain('outbound-host · index.js · b.example.com')
  })

  it('states the package-level static scope on every result', async () => {
    const comparable = renderDiffText(
      await diffOf(
        { 'package.json': PKG, 'index.js': 'export const x = 1' },
        { 'package.json': PKG, 'index.js': 'export const x = 2' },
      ),
    )
    expect(comparable).toContain('package-level static behavior only')
    const incomparable = renderDiffText({
      comparability: 'incomparable',
      reasons: ['scanner-mismatch'],
      base: { scanner: { name: 'a', version: '1', ranAt: 't' }, grade: 'A', subject: { analysisInputDigest: 'sha256:x' } },
      head: { scanner: { name: 'a', version: '2', ranAt: 't' }, grade: 'A', subject: { analysisInputDigest: 'sha256:y' } },
      findings: { added: [], removed: [], changed: [], unchanged: [] },
      observations: { added: [], removed: [], countChanged: [], unchanged: [] },
    } as never)
    expect(incomparable).toContain('package-level static behavior only')
  })

  it('renders incomparable results with reasons and the rescan guidance', () => {
    const diff = {
      schema: 'dsh-vet/diff/v1',
      base: {
        scanner: { name: 'dsh-vet', version: '0.3.0', ranAt: '2026-01-01T00:00:00.000Z' },
        grade: 'C',
        subject: { analysisInputDigest: `sha256:${'a'.repeat(64)}` },
      },
      head: {
        scanner: { name: 'dsh-vet', version: '0.4.0', ranAt: '2026-01-01T00:00:00.000Z' },
        grade: 'C',
        subject: { analysisInputDigest: `sha256:${'b'.repeat(64)}` },
      },
      comparability: 'incomparable',
      reasons: ['scanner-mismatch'],
      findings: { added: [], removed: [], changed: [], unchanged: [] },
      observations: { added: [], removed: [], countChanged: [], unchanged: [] },
    } as unknown as VetDiff
    const text = renderDiffText(diff)
    expect(text.split('\n')[0]).toBe('dsh-vet diff · incomparable')
    expect(text).toContain('reasons: scanner-mismatch')
    expect(text).toContain('comparison unavailable')
    expect(text).not.toContain('added findings')
  })

  it('discloses truncation beyond ten entries', async () => {
    const headCode = ['await fetch("https://a.example.com/x")']
    for (let i = 1; i <= 7; i++) headCode.push(`await fetch('https://host${i}.example.com/p')`)
    const text = renderDiffText(
      await diffOf(
        { 'package.json': PKG, 'index.js': headCode[0]! },
        { 'package.json': PKG, 'index.js': headCode.join('\n') },
      ),
    )
    expect(text).toContain('added findings (14):')
    expect(text).toContain('…and 4 more — truncated; rerun with --json for the full result')
  })

  it('strips control characters from report-derived text', () => {
    const diff = {
      schema: 'dsh-vet/diff/v1',
      base: {
        scanner: { name: 'dsh-vet', version: '0.3.0', ranAt: '2026-01-01T00:00:00.000Z' },
        grade: 'A',
        subject: { packageName: 'demo\u0007', analysisInputDigest: `sha256:${'a'.repeat(64)}` },
      },
      head: {
        scanner: { name: 'dsh-vet', version: '0.3.0', ranAt: '2026-01-01T00:00:00.000Z' },
        grade: 'A',
        subject: { packageName: 'demo', analysisInputDigest: `sha256:${'b'.repeat(64)}` },
      },
      comparability: 'comparable',
      reasons: [],
      findings: {
        added: [{ rule: 'x.y', variant: 'v', file: 'a\u0000b.js', subject: 'host\u001b[31m', finding: 0 }],
        removed: [],
        changed: [],
        unchanged: [],
      },
      observations: { added: [], removed: [], countChanged: [], unchanged: [] },
    } as unknown as VetDiff
    const text = renderDiffText(diff)
    expect(text).not.toContain('\u0007')
    expect(text).not.toContain('\u0000')
    expect(text).not.toContain('\u001b')
    expect(text).toContain('x.y · v · ab.js · host[31m')
  })
})
