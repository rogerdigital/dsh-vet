import { readFileSync, readdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { validateReport } from '../src/validate.ts'
import type { VetReport } from '../src/contract.ts'
import { runCli } from '../src/cli.ts'

const kitchenSink = JSON.parse(
  readFileSync(new URL('../fixtures/offender-kitchen-sink/expected.report.json', import.meta.url), 'utf8'),
) as VetReport

/** Clone the fixture, mutate it, return it as unknown — the validator's input type. */
function mutate(fn: (report: any) => void): unknown {
  const report = structuredClone(kitchenSink)
  fn(report)
  return report
}

describe('validateReport', () => {
  it('accepts an unmodified report', () => {
    expect(validateReport(kitchenSink)).toEqual({ ok: true, issues: [] })
  })

  it('rejects non-object input', () => {
    for (const input of ['dsh-vet/v1', [kitchenSink], null]) {
      const result = validateReport(input)
      expect(result.ok).toBe(false)
      expect(result.issues[0]!.path).toBe('report')
    }
  })

  it('requires the exact schema literal', () => {
    const result = validateReport(mutate((r) => { r.schema = 'dsh-vet/v2' }))
    expect(result.issues).toContainEqual({ path: 'schema', message: expect.stringContaining('dsh-vet/v1') })
  })

  it('checks target shape', () => {
    const kind = validateReport(mutate((r) => { r.target.kind = 'registry' }))
    expect(kind.issues).toContainEqual({ path: 'target.kind', message: expect.any(String) })
    const specifier = validateReport(mutate((r) => { r.target.specifier = 42 }))
    expect(specifier.issues).toContainEqual({ path: 'target.specifier', message: expect.any(String) })
    const resolved = validateReport(mutate((r) => { r.target.resolved = 3 }))
    expect(resolved.issues).toContainEqual({ path: 'target.resolved', message: expect.any(String) })
    const integrity = validateReport(mutate((r) => { r.target.resolved = { integrity: 7 } }))
    expect(integrity.issues).toContainEqual({ path: 'target.resolved.integrity', message: expect.any(String) })
  })

  it('requires scanner.ranAt to be RFC 3339', () => {
    for (const bad of ['yesterday', '2026-09-01', '2026-09-01T00:00:00 (no zone)']) {
      const result = validateReport(mutate((r) => { r.scanner.ranAt = bad }))
      expect(result.issues).toContainEqual({ path: 'scanner.ranAt', message: expect.stringContaining('RFC 3339') })
    }
    expect(validateReport(mutate((r) => { r.scanner.ranAt = '2026-09-01T12:30:45+08:00' })).ok).toBe(true)
  })

  it('rejects a summary the findings do not derive', () => {
    const counts = validateReport(mutate((r) => { r.summary.counts.high += 1 }))
    expect(counts.issues).toContainEqual({
      path: 'summary.counts.high',
      message: expect.stringContaining('never asserted'),
    })
    const grade = validateReport(mutate((r) => { r.summary.grade = 'A' }))
    expect(grade.issues).toContainEqual({
      path: 'summary.grade',
      message: expect.stringContaining('derive'),
    })
  })

  it('exempts grade X from derivation but not from counts', () => {
    const result = validateReport(mutate((r) => { r.summary.grade = 'X' }))
    expect(result.ok).toBe(true)
  })

  it('checks finding shape', () => {
    const id = validateReport(mutate((r) => { r.findings[0].id = 'NoDots' }))
    expect(id.issues).toContainEqual({ path: 'findings[0].id', message: expect.stringContaining('vendor') })
    const severity = validateReport(mutate((r) => { r.findings[0].severity = 'extreme' }))
    expect(severity.issues).toContainEqual({ path: 'findings[0].severity', message: expect.any(String) })
    const confidence = validateReport(mutate((r) => { r.findings[0].confidence = 'maybe' }))
    expect(confidence.issues).toContainEqual({ path: 'findings[0].confidence', message: expect.any(String) })
    const evidence = validateReport(mutate((r) => { r.findings[0].evidence = [] }))
    expect(evidence.issues).toContainEqual({ path: 'findings[0].evidence', message: expect.stringContaining('non-empty') })
    const references = validateReport(mutate((r) => { r.findings[0].references = [7] }))
    expect(references.issues).toContainEqual({ path: 'findings[0].references', message: expect.any(String) })
  })

  it('requires evidence.line to be a positive integer', () => {
    for (const bad of [0, -1, 1.5, '7']) {
      const result = validateReport(mutate((r) => { r.findings[0].evidence[0].line = bad }))
      expect(result.issues).toContainEqual({ path: 'findings[0].evidence[0].line', message: expect.stringContaining('positive integer') })
    }
  })

  it('rejects unsorted findings', () => {
    const result = validateReport(mutate((r) => {
      const [first, second] = r.findings
      r.findings[0] = second
      r.findings[1] = first
    }))
    expect(result.issues).toContainEqual({ path: 'findings', message: expect.stringContaining('sorted') })
  })

  it('ignores unknown fields everywhere (design rule 4)', () => {
    const result = validateReport(mutate((r) => {
      r['x-extra'] = { anything: true }
      r.target['x-note'] = 1
      r.findings[0]['x-confidence-override'] = 'high'
      r.findings[0].evidence[0]['x-raw'] = null
      r.summary.counts['x-total'] = 99
    }))
    expect(result.ok).toBe(true)
  })

  it('collects every issue instead of failing on the first', () => {
    const result = validateReport(mutate((r) => {
      r.schema = 'other/v1'
      r.target.kind = 'dream'
      r.summary.counts.low = 99
    }))
    expect(result.issues.map((i) => i.path)).toEqual(['schema', 'target.kind', 'summary.counts.low'])
  })
})

describe('validateReport against the corpus', () => {
  const ROOT = fileURLToPath(new URL('..', import.meta.url))
  const files = [
    ...readdirSync(join(ROOT, 'fixtures'), { recursive: true })
      .filter((f) => String(f).endsWith('expected.report.json'))
      .map((f) => join(ROOT, 'fixtures', String(f))),
    ...readdirSync(join(ROOT, 'examples'), { recursive: true })
      .filter((f) => String(f).endsWith('.report.json'))
      .map((f) => join(ROOT, 'examples', String(f))),
  ]

  it('every committed report validates, including those emitted by scanner 0.1.0', () => {
    expect(files.length).toBeGreaterThan(10)
    for (const file of files) {
      const result = validateReport(JSON.parse(readFileSync(file, 'utf8')))
      expect(result.issues, `${file}: ${JSON.stringify(result.issues)}`).toEqual([])
    }
  })
})

describe('runCli validate', () => {
  const FIXTURES = new URL('../fixtures', import.meta.url).pathname

  function io() {
    const out: string[] = []
    const err: string[] = []
    return { stdout: (l: string) => out.push(l), stderr: (l: string) => err.push(l), out, err }
  }

  it('accepts a valid report with exit 0', async () => {
    const stream = io()
    const code = await runCli(['validate', `${FIXTURES}/offender-kitchen-sink/expected.report.json`], stream)
    expect(code).toBe(0)
    expect(stream.out.join('\n')).toContain('ok')
  })

  it('reports invalid reports with exit 1 and their issues', async () => {
    const work = mkdtempSync(join(tmpdir(), 'dsh-vet-validate-'))
    try {
      const bad = join(work, 'bad.report.json')
      writeFileSync(bad, JSON.stringify(mutate((r) => { r.summary.grade = 'A' })))
      const stream = io()
      const code = await runCli(['validate', bad], stream)
      expect(code).toBe(1)
      const out = stream.out.join('\n')
      expect(out).toContain('invalid')
      expect(out).toContain('summary.grade')
    } finally {
      rmSync(work, { recursive: true, force: true })
    }
  })

  it('checks multiple files and fails if any is invalid', async () => {
    const work = mkdtempSync(join(tmpdir(), 'dsh-vet-validate-'))
    try {
      const bad = join(work, 'bad.report.json')
      writeFileSync(bad, JSON.stringify(mutate((r) => { r.findings[0].evidence = [] })))
      const stream = io()
      const code = await runCli(
        ['validate', `${FIXTURES}/offender-kitchen-sink/expected.report.json`, bad],
        stream,
      )
      expect(code).toBe(1)
      const out = stream.out.join('\n')
      expect(out).toContain('ok')
      expect(out).toContain('invalid')
    } finally {
      rmSync(work, { recursive: true, force: true })
    }
  })

  it('rejects missing arguments, --help, and unreadable files', async () => {
    expect(await runCli(['validate'], io())).toBe(2)
    expect(await runCli(['validate', '--help'], io())).toBe(2)
    const stream = io()
    expect(await runCli(['validate', '/nope/missing.json'], stream)).toBe(2)
    expect(stream.err.join('\n')).toContain('cannot read report')
  })
})
