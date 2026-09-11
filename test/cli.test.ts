import { readFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runCli } from '../src/cli.ts'
import { scanDirectory } from '../src/scanner.ts'

const FIXTURES = new URL('../fixtures', import.meta.url).pathname

function io() {
  const out: string[] = []
  const err: string[] = []
  return {
    stdout: (line: string) => out.push(line),
    stderr: (line: string) => err.push(line),
    out,
    err,
  }
}

/** Scan a controlled target and persist the report to a temp file outside it. */
async function reportFile(files: Record<string, string>): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-vet-cli-'))
  for (const [path, content] of Object.entries(files)) {
    writeFileSync(join(dir, path), content)
  }
  let report: string
  try {
    report = JSON.stringify(await scanDirectory(dir, { now: () => '2026-01-01T00:00:00.000Z' }))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  const file = join(mkdtempSync(join(tmpdir(), 'dsh-vet-cli-report-')), 'report.json')
  writeFileSync(file, report)
  return file
}

describe('runCli', () => {
  it('prints a human summary and exits 0 on a completed report', async () => {
    const stream = io()
    const code = await runCli([`${FIXTURES}/clean-seams-declared`], stream)
    expect(code).toBe(0)
    expect(stream.out.join('\n')).toContain('grade: A')
    expect(stream.out.join('\n')).toContain('egress.outbound-endpoints')
  })

  it('emits a dsh-vet/v1 JSON report with --json', async () => {
    const stream = io()
    const code = await runCli(['--json', `${FIXTURES}/offender-kitchen-sink`], stream)
    expect(code).toBe(0)
    const report = JSON.parse(stream.out.join('\n'))
    expect(report.schema).toBe('dsh-vet/v1')
    expect(report.summary.grade).toBe('D')
  })

  it('exits 1 under --strict when high+medium findings exist', async () => {
    const stream = io()
    const code = await runCli(['--strict', `${FIXTURES}/offender-kitchen-sink`], stream)
    expect(code).toBe(1)
    expect(stream.err.join('\n')).toContain('threshold breached')
  })

  it('exits 0 under --strict on a clean plugin', async () => {
    const stream = io()
    const code = await runCli(['--strict', `${FIXTURES}/clean-seams-declared`], stream)
    expect(code).toBe(0)
  })

  it('honors --fail-on overrides', async () => {
    const medium = io()
    expect(await runCli(['--fail-on', 'critical', `${FIXTURES}/offender-kitchen-sink`], medium)).toBe(0)
    const low = io()
    expect(await runCli(['--fail-on', 'medium', `${FIXTURES}/offender-kitchen-sink`], low)).toBe(1)
    const invalid = io()
    expect(await runCli(['--fail-on', 'bananas', `${FIXTURES}/clean-seams-declared`], invalid)).toBe(2)
  })

  it('filters rules with --rules', async () => {
    const stream = io()
    const code = await runCli(['--json', '--rules', 'dep.install-scripts', `${FIXTURES}/offender-kitchen-sink`], stream)
    expect(code).toBe(0)
    const report = JSON.parse(stream.out.join('\n'))
    expect(report.findings.map((f: { id: string }) => f.id)).toEqual(['dep.install-scripts'])
  })

  it('fails with exit 2 on usage and scanner errors', async () => {
    expect(await runCli([], io())).toBe(2)
    expect(await runCli(['a', 'b'], io())).toBe(2)
    const stream = io()
    expect(await runCli(['/definitely/not/here',], stream)).toBe(2)
    expect(stream.err.join('\n')).toContain('not a directory')
  })

  it('prints version and help', async () => {
    const version = io()
    expect(await runCli(['--version'], version)).toBe(0)
    expect(version.out[0]).toMatch(/^\d+\.\d+\.\d+$/)
    const help = io()
    expect(await runCli(['--help'], help)).toBe(0)
    expect(help.out.join('\n')).toContain('usage: dsh-vet')
  })
})

describe('runCli diff', () => {
  const PKG = '{"name":"diff-demo","main":"index.js"}'

  it('exits 0 with a comparable result regardless of risk changes', async () => {
    const base = await reportFile({ 'package.json': PKG, 'index.js': "await fetch('https://a.example.com/x')" })
    const head = await reportFile({
      'package.json': PKG,
      'index.js': "await fetch('https://a.example.com/x')\nawait fetch('https://b.example.com/y')",
    })
    const stream = io()
    const code = await runCli(['diff', base, head], stream)
    expect(code).toBe(0)
    const out = stream.out.join('\n')
    expect(out).toContain('dsh-vet diff · comparable')
    expect(out).toContain('b.example.com')
  })

  it('emits a dsh-vet/diff/v1 JSON result with --json', async () => {
    const base = await reportFile({ 'package.json': PKG, 'index.js': 'export const x = 1' })
    const head = await reportFile({ 'package.json': PKG, 'index.js': 'export const x = 2' })
    const stream = io()
    const code = await runCli(['diff', '--json', base, head], stream)
    expect(code).toBe(0)
    const diff = JSON.parse(stream.out.join('\n'))
    expect(diff.schema).toBe('dsh-vet/diff/v1')
    expect(diff.comparability).toBe('comparable')
  })

  it('exits 1 for valid reports that cannot be compared', async () => {
    const base = await reportFile({ 'package.json': PKG, 'index.js': 'export const x = 1' })
    const head = await reportFile({
      'package.json': '{"name":"other-demo","main":"index.js"}',
      'index.js': 'export const x = 1',
    })
    const stream = io()
    const code = await runCli(['diff', base, head], stream)
    expect(code).toBe(1)
    expect(stream.out.join('\n')).toContain('incomparable')
    expect(stream.out.join('\n')).toContain('subject-mismatch')
  })

  it('compares unlabeled local scans under --subject', async () => {
    const files = { 'index.js': 'export const x = 1' }
    const base = await reportFile(files)
    const head = await reportFile(files)
    const unlabeled = io()
    expect(await runCli(['diff', base, head], unlabeled)).toBe(1)
    expect(unlabeled.out.join('\n')).toContain('subject-unlabeled')
    const labeled = io()
    expect(await runCli(['diff', '--subject', 'my-plugin', base, head], labeled)).toBe(0)
  })

  it('exits 2 on invalid reports with their issues on stderr', async () => {
    const base = await reportFile({ 'package.json': PKG, 'index.js': 'export const x = 1' })
    const work = mkdtempSync(join(tmpdir(), 'dsh-vet-diff-bad-'))
    try {
      const bad = join(work, 'bad.report.json')
      const parsed = JSON.parse(readFileSync(base, 'utf8'))
      parsed.summary.grade = 'B'
      writeFileSync(bad, JSON.stringify(parsed))
      const stream = io()
      expect(await runCli(['diff', base, bad], stream)).toBe(2)
      expect(stream.err.join('\n')).toContain('summary.grade')
    } finally {
      rmSync(work, { recursive: true, force: true })
    }
  })

  it('exits 2 on missing files and wrong argument count', async () => {
    const base = await reportFile({ 'package.json': PKG, 'index.js': 'export const x = 1' })
    const missing = io()
    expect(await runCli(['diff', base, '/nope/missing.json'], missing)).toBe(2)
    expect(missing.err.join('\n')).toContain('cannot read report')
    expect(await runCli(['diff', base], io())).toBe(2)
    expect(await runCli(['diff'], io())).toBe(2)
  })
})
