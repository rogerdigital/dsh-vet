import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { VetReport } from '../src/contract.ts'
import { scanDirectory } from '../src/scanner.ts'
import type { ScanOptions } from '../src/scanner.ts'
import { DIFF_SCHEMA_ID, compareReports } from '../src/compare.ts'

const NOW = () => '2026-01-01T00:00:00.000Z'

function fixture(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-vet-cmp-'))
  for (const [path, content] of Object.entries(files)) {
    const abs = join(dir, path)
    mkdirSync(join(abs, '..'), { recursive: true })
    writeFileSync(abs, content)
  }
  return dir
}

async function reportOf(files: Record<string, string>, options: ScanOptions = {}): Promise<VetReport> {
  const dir = fixture(files)
  try {
    return await scanDirectory(dir, { now: NOW, ...options })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** Clone a report, mutate it, return it as unknown — the comparator's input type. */
function mutate(report: VetReport, fn: (draft: any) => void): unknown {
  const draft = structuredClone(report)
  fn(draft)
  return draft
}

const NET_PKG = '{"name":"net-demo","main":"index.js"}'

describe('compareReports — comparable pairs', () => {
  it('returns an empty diff for identical content under different roots', async () => {
    const files = { 'package.json': NET_PKG, 'index.js': "await fetch('https://a.example.com/x')" }
    const diff = compareReports(await reportOf(files), await reportOf(files))
    expect(diff.schema).toBe(DIFF_SCHEMA_ID)
    expect(diff.comparability).toBe('comparable')
    expect(diff.reasons).toEqual([])
    expect(diff.findings.added).toEqual([])
    expect(diff.findings.removed).toEqual([])
    expect(diff.findings.changed).toEqual([])
    expect(diff.observations.added).toEqual([])
    expect(diff.observations.removed).toEqual([])
    expect(diff.base.subject.analysisInputDigest).toBe(diff.head.subject.analysisInputDigest)
  })

  it('reports an added host as a finding identity and an observation, grade unchanged', async () => {
    const base = await reportOf({
      'package.json': NET_PKG,
      'index.js': "await fetch('https://a.example.com/x')",
    })
    const head = await reportOf({
      'package.json': NET_PKG,
      'index.js': "await fetch('https://a.example.com/x')\nawait fetch('https://b.example.com/y')",
    })
    const diff = compareReports(base, head)
    expect(diff.comparability).toBe('comparable')
    expect(diff.base.grade).toBe(diff.head.grade)
    // Both the egress inventory and the network-client rule track the host.
    expect(diff.findings.added.map((i) => i.rule).sort()).toEqual([
      'egress.outbound-endpoints',
      'perm.network-client',
    ])
    expect(diff.observations.added.map((o) => o.subject)).toEqual(['b.example.com'])
    expect(diff.findings.removed).toEqual([])
  })

  it('reports a removed identity without claiming a fix', async () => {
    const base = await reportOf({
      'package.json': NET_PKG,
      'index.js': "await fetch('https://a.example.com/x')\neval(process.argv[1])",
    })
    const head = await reportOf({
      'package.json': NET_PKG,
      'index.js': "await fetch('https://a.example.com/x')",
    })
    const diff = compareReports(base, head)
    expect(diff.findings.removed.map((i) => `${i.rule}|${i.variant}|${i.subject}`)).toEqual([
      'obf.eval-detect|dynamic|eval',
    ])
    expect(diff.findings.added).toEqual([])
  })

  it('exposes matched severity transitions with both sides recorded', async () => {
    const base = await reportOf({
      'package.json': NET_PKG,
      'index.js': "await fetch('https://a.example.com/x')",
    })
    const head = await reportOf({
      'package.json': '{"name":"net-demo","main":"index.js","dsh":{"seams":["web"]}}',
      'index.js': "await fetch('https://a.example.com/x')",
    })
    const diff = compareReports(base, head)
    expect(diff.comparability).toBe('comparable')
    const transition = diff.findings.changed.find(
      (t) => t.identity.rule === 'perm.network-client' && t.identity.subject === 'a.example.com',
    )
    expect(transition).toBeDefined()
    expect(transition!.severity).toEqual({ base: 'medium', head: 'info' })
    expect(transition!.confidence).toEqual({ base: 'high', head: 'high' })
  })

  it('classifies count changes on repeated identical subjects separately from additions', async () => {
    const base = await reportOf({
      'package.json': NET_PKG,
      'index.js': "eval(process.argv[1])",
    })
    const head = await reportOf({
      'package.json': NET_PKG,
      'index.js': 'eval(process.argv[1])\neval(process.argv[2])',
    })
    const diff = compareReports(base, head)
    expect(diff.findings.added).toEqual([])
    expect(diff.findings.changed).toHaveLength(1)
    expect(diff.findings.changed[0]!.identity).toMatchObject({ rule: 'obf.eval-detect', variant: 'dynamic' })
    expect(diff.findings.changed[0]!.count).toEqual({ base: 1, head: 2 })
  })

  it('treats line movement as no risk addition', async () => {
    const base = await reportOf({
      'package.json': NET_PKG,
      'index.js': "const fs = require('node:fs')\nfs.writeFileSync('/etc/hosts', 'x')\nawait fetch('https://a.example.com/x')",
    })
    const head = await reportOf({
      'package.json': NET_PKG,
      'index.js': "// leading comment inserted\nconst fs = require('node:fs')\n\nfs.writeFileSync('/etc/hosts', 'x')\nawait fetch('https://a.example.com/x')",
    })
    const diff = compareReports(base, head)
    expect(diff.comparability).toBe('comparable')
    expect(diff.findings.added).toEqual([])
    expect(diff.findings.removed).toEqual([])
    expect(diff.findings.changed).toEqual([])
  })

  it('keeps observation deltas visible when grades are identical', async () => {
    const base = await reportOf({
      'package.json': '{"name":"cap-demo","main":"index.js","dsh":{"seams":["fs","web"]}}',
      'index.js': "const fs = require('node:fs')\nfs.readFileSync('/tmp/dsh/data')",
    })
    const head = await reportOf({
      'package.json': '{"name":"cap-demo","main":"index.js","dsh":{"seams":["fs","web"]}}',
      'index.js': "const fs = require('node:fs')\nfs.readFileSync('/tmp/dsh/data')\nawait fetch('https://info.example.com/ping')",
    })
    const diff = compareReports(base, head)
    expect(diff.base.grade).toBe('A')
    expect(diff.head.grade).toBe('A')
    expect(diff.observations.added.map((o) => `${o.kind}:${o.subject}`)).toEqual([
      'capability:net',
      'outbound-host:info.example.com',
    ])
  })

  it('compares unlabeled local scans only under an explicit subject label', async () => {
    const files = { 'index.js': 'export const x = 1' }
    const base = await reportOf(files)
    const head = await reportOf(files)
    expect(compareReports(base, head).reasons).toContain('subject-unlabeled')
    const labeled = compareReports(base, head, { subjectLabel: 'my-plugin' })
    expect(labeled.comparability).toBe('comparable')
    expect(labeled.base.subject.subjectLabel).toBe('my-plugin')
    expect(labeled.head.subject.subjectLabel).toBe('my-plugin')
  })
})

describe('compareReports — comparability gates', () => {
  const files = { 'package.json': NET_PKG, 'index.js': "await fetch('https://a.example.com/x')" }

  it('rejects structurally invalid reports', async () => {
    const base = await reportOf(files)
    const diff = compareReports(mutate(base, (r) => { r.summary.counts.high += 1 }), base)
    expect(diff.comparability).toBe('incomparable')
    expect(diff.reasons).toEqual(['report-invalid-base'])
    expect(diff.findings.added).toEqual([])
  })

  it('rejects absent, unsupported, and invalid scan contexts', async () => {
    const base = await reportOf(files)
    const head = await reportOf(files)
    expect(compareReports(mutate(base, (r) => { delete r['x-dsh-vet'] }), head).reasons).toEqual([
      'context-absent-base',
    ])
    expect(compareReports(base, mutate(head, (r) => { r['x-dsh-vet'].version = 2 })).reasons).toEqual([
      'context-unsupported-head',
    ])
    expect(
      compareReports(base, mutate(head, (r) => { r['x-dsh-vet'].coverage.parsed = 99 })).reasons,
    ).toEqual(['context-invalid-head'])
  })

  it('rejects missing finding identities', async () => {
    const base = await reportOf(files)
    const head = await reportOf(files)
    const diff = compareReports(base, mutate(head, (r) => { delete r['x-dsh-vet'].findingIdentities }))
    expect(diff.reasons).toEqual(['identities-absent-head'])
    expect(diff.comparability).toBe('incomparable')
  })

  it('rejects scanner and profile mismatches', async () => {
    const base = await reportOf(files)
    const head = await reportOf(files)
    expect(compareReports(base, mutate(head, (r) => { r.scanner.version = '9.9.9' })).reasons).toEqual([
      'scanner-mismatch',
    ])
    // A rule subset changes the profile digest and the coverage status.
    const subset = await reportOf(files, { rules: ['perm.network-client'] })
    const reasons = compareReports(base, subset).reasons
    expect(reasons).toContain('profile-mismatch')
    expect(reasons).toContain('coverage-partial-head')
  })

  it('rejects different package identities', async () => {
    const base = await reportOf(files)
    const head = await reportOf({
      'package.json': '{"name":"other-demo","main":"index.js"}',
      'index.js': "await fetch('https://a.example.com/x')",
    })
    expect(compareReports(base, head).reasons).toEqual(['subject-mismatch'])
  })

  it('rejects grade X and partial coverage', async () => {
    const base = await reportOf(files)
    const head = await reportOf(files)
    expect(compareReports(base, mutate(head, (r) => { r.summary.grade = 'X' })).reasons).toEqual(['grade-x-head'])
    const broken = await reportOf({
      'package.json': NET_PKG,
      'index.js': 'export const ok = 1',
      'broken.js': 'function {{{',
    })
    const reasons = compareReports(base, broken).reasons
    expect(reasons).toContain('coverage-partial-head')
  })
})

describe('compareReports — purity and determinism', () => {
  function deepFreeze<T>(value: T): T {
    if (value && typeof value === 'object') {
      for (const key of Object.keys(value as object)) {
        deepFreeze((value as Record<string, unknown>)[key])
      }
      Object.freeze(value)
    }
    return value
  }

  it('does not mutate either report', async () => {
    const files = {
      'package.json': NET_PKG,
      'index.js': "await fetch('https://a.example.com/x')\neval(process.argv[1])",
    }
    const base = await reportOf(files)
    const head = await reportOf({
      'package.json': NET_PKG,
      'index.js': "await fetch('https://a.example.com/x')\nawait fetch('https://b.example.com/y')",
    })
    const baseFrozen = JSON.stringify(deepFreeze(structuredClone(base)))
    const headFrozen = JSON.stringify(deepFreeze(structuredClone(head)))
    expect(() => compareReports(deepFreeze(structuredClone(base)), deepFreeze(structuredClone(head)))).not.toThrow()
    expect(JSON.stringify(base)).toBe(baseFrozen)
    expect(JSON.stringify(head)).toBe(headFrozen)
  })

  it('produces byte-identical results across runs of the same pair', async () => {
    const base = await reportOf({
      'package.json': NET_PKG,
      'index.js': "await fetch('https://a.example.com/x')",
    })
    const head = await reportOf({
      'package.json': NET_PKG,
      'index.js': "await fetch('https://a.example.com/x')\nawait fetch('https://b.example.com/y')",
    })
    expect(JSON.stringify(compareReports(base, head))).toBe(JSON.stringify(compareReports(base, head)))
  })
})
