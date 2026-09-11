import { createHash } from 'node:crypto'
import { readFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runRules, ruleIds } from '../src/rules/index.ts'
import { SCANNER_VERSION, scan, scanDirectory } from '../src/scanner.ts'
import { analyze } from '../src/analyze.ts'
import { validateReport } from '../src/validate.ts'
import type { ScanContextV1 } from '../src/scan-context.ts'
import { fakeFetchBody, fakeResponse, gzippedTar } from './helpers.ts'

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

  it('refuses to grade an empty audit as clean (scan.empty-audit)', async () => {
    const empty = mkdtempSync(join(tmpdir(), 'dsh-vet-empty-'))
    try {
      writeFileSync(join(empty, 'package.json'), '{"name":"ts-only","main":"dist/index.js"}')
      mkdirSync(join(empty, 'src'), { recursive: true })
      writeFileSync(join(empty, 'src', 'index.ts'), 'export const x = 1')
      const report = await scanDirectory(empty, { now: () => '2026-01-01T00:00:00.000Z' })
      expect(report.summary.grade).toBe('C')
      expect(report.findings.map((f) => f.id)).toEqual(['scan.empty-audit'])
    } finally {
      rmSync(empty, { recursive: true, force: true })
    }
  })

  it('reports runtime-value write targets as unverifiable, not out-of-scope (dispute #10)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-vet-dynwrite-'))
    try {
      writeFileSync(join(dir, 'package.json'), '{"name":"managed-cleaner","main":"index.js"}')
      writeFileSync(
        join(dir, 'index.js'),
        "const { rm } = require('node:fs')\nconst target = derive()\nawait rm(target, { recursive: true })\nfunction derive() { return process.env.DSH_HOME }\n",
      )
      const report = await scanDirectory(dir, { now: () => '2026-01-01T00:00:00.000Z' })
      const finding = report.findings.find((f) => f.id === 'perm.undeclared-fs-write')
      expect(finding?.severity).toBe('low')
      expect(finding?.confidence).toBe('low')
      expect(finding?.title).toContain('not statically verifiable')
      // Low confidence never grades: an unresolvable target must not read as an accusation.
      expect(report.summary.grade).toBe('A')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('scan context and coverage', () => {
  const NOW = () => '2026-01-01T00:00:00.000Z'

  /** Create a controlled target directory from a file map. */
  function target(files: Record<string, string>): string {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-vet-ctx-'))
    for (const [path, content] of Object.entries(files)) {
      const abs = join(dir, path)
      mkdirSync(join(abs, '..'), { recursive: true })
      writeFileSync(abs, content)
    }
    return dir
  }

  it('emits a validating, complete context for a fully-scanned fixture', async () => {
    const report = await scanDirectory(new URL('../fixtures/clean-seams-declared', import.meta.url).pathname, {
      now: NOW,
    })
    const context = report['x-dsh-vet']
    expect(context).toBeDefined()
    expect(validateReport(report).issues).toEqual([])
    expect(context!.coverage.status).toBe('complete')
    expect(context!.coverage.candidateJs).toBe(1)
    expect(context!.coverage.parsed).toBe(1)
    expect(context!.coverage.parseFailures).toBe(0)
    expect(context!.coverage.failedFiles).toEqual([])
    expect(context!.coverage.entries.resolved).toEqual(['index.js'])
    expect(context!.coverage.entries.unresolved).toEqual([])
    expect(context!.coverage.omissions).toEqual([])
    expect(context!.coverage.dependencyMode).toBe('not-scanned')
    expect(context!.coverage.limitations.length).toBeGreaterThan(0)
    expect(context!.profile.rules).toEqual([...new Set([...ruleIds(), 'scan.empty-audit'])].sort())
    expect(context!.profile.analyzerRevision).toBe(`dsh-vet-analyzer/${SCANNER_VERSION}`)
    expect(context!.subject.packageName).toBe('dsh-clean-demo')
    expect(context!.subject.digestKind).toBe('dsh-vet/analysis-input@1')
    expect(context!.subject.analysisInputDigest).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(context!.subject.archiveDigest).toBeUndefined()
    expect(context!.observations).toEqual([])
  })

  it('derives an identical context across runs and roots with the same content', async () => {
    const first = target({ 'package.json': '{"name":"m","main":"index.js"}', 'index.js': 'export const x = 1' })
    const second = target({ 'package.json': '{"name":"m","main":"index.js"}', 'index.js': 'export const x = 1' })
    try {
      const a = await scanDirectory(first, { now: NOW })
      const b = await scanDirectory(second, { now: NOW })
      expect(a['x-dsh-vet']).toEqual(b['x-dsh-vet'])
      expect(a['x-dsh-vet']!.coverage.status).toBe('complete')
    } finally {
      rmSync(first, { recursive: true, force: true })
      rmSync(second, { recursive: true, force: true })
    }
  })

  it('names parse failures and marks coverage partial', async () => {
    const dir = target({
      'package.json': '{"name":"broken-demo","main":"index.js"}',
      'index.js': 'export const ok = 1',
      'broken.js': 'function {{{',
    })
    try {
      const report = await scanDirectory(dir, { now: NOW })
      const coverage = report['x-dsh-vet']!.coverage
      expect(validateReport(report).issues).toEqual([])
      expect(coverage.status).toBe('partial')
      expect(coverage.candidateJs).toBe(2)
      expect(coverage.parsed).toBe(1)
      expect(coverage.parseFailures).toBe(1)
      expect(coverage.failedFiles).toEqual(['broken.js'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('reports a declared entry that resolves to no file as unresolved', async () => {
    const dir = target({
      'package.json': '{"name":"missing-entry","main":"does-not-exist.js"}',
      'index.js': 'export const x = 1',
    })
    try {
      const report = await scanDirectory(dir, { now: NOW })
      const coverage = report['x-dsh-vet']!.coverage
      expect(coverage.status).toBe('partial')
      expect(coverage.entries.resolved).toEqual([])
      expect(coverage.entries.unresolved).toEqual(['does-not-exist.js'])
      // No fabricated reachability: the one JS file is not claimed reachable.
      expect(report.findings.some((f) => f.id === 'perm.unreachable-files')).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('keeps zero-JS targets partial while retaining the empty-audit finding', async () => {
    const dir = target({ 'package.json': '{"name":"ts-only","main":"dist/index.js"}' })
    try {
      mkdirSync(join(dir, 'src'))
      writeFileSync(join(dir, 'src', 'index.ts'), 'export const x = 1')
      const report = await scanDirectory(dir, { now: NOW })
      const context = report['x-dsh-vet']!
      expect(report.findings.map((f) => f.id)).toEqual(['scan.empty-audit'])
      expect(context.coverage.status).toBe('partial')
      expect(context.coverage.candidateJs).toBe(0)
      expect(context.coverage.entries.unresolved).toEqual(['dist/index.js'])
      expect(context.profile.rules).toContain('scan.empty-audit')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('marks a selected rule subset as visibly partial with honest rule recording', async () => {
    const dir = target({ 'package.json': '{"name":"subset-demo","main":"index.js"}', 'index.js': 'export const x = 1' })
    try {
      const report = await scanDirectory(dir, { rules: ['dep.install-scripts'], now: NOW })
      const context = report['x-dsh-vet']!
      expect(validateReport(report).issues).toEqual([])
      expect(context.profile.rules).toEqual(['dep.install-scripts', 'scan.empty-audit'])
      expect(context.coverage.status).toBe('partial')
      // The automatic empty-audit still executes on a subset scan.
      expect(context.coverage.candidateJs).toBe(1)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('treats a full explicit rule selection as complete-equivalent', async () => {
    const dir = target({ 'package.json': '{"name":"full-subset","main":"index.js"}', 'index.js': 'export const x = 1' })
    try {
      const report = await scanDirectory(dir, { rules: ruleIds(), now: NOW })
      expect(report['x-dsh-vet']!.coverage.status).toBe('complete')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('counts a Node-shebang executable as an analyzed candidate', async () => {
    const dir = target({
      'package.json': '{"name":"cli-demo","bin":"cli"}',
      cli: '#!/usr/bin/env node\nconsole.log(1)',
    })
    try {
      const report = await scanDirectory(dir, { now: NOW })
      const coverage = report['x-dsh-vet']!.coverage
      expect(coverage.candidateJs).toBe(1)
      expect(coverage.parsed).toBe(1)
      expect(coverage.entries.resolved).toEqual(['cli'])
      expect(coverage.status).toBe('complete')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('records symlinks as omissions instead of following them', async () => {
    const dir = target({ 'package.json': '{"name":"link-demo","main":"index.js"}', 'index.js': 'export const x = 1' })
    try {
      symlinkSync('index.js', join(dir, 'link.js'))
      const report = await scanDirectory(dir, { now: NOW })
      const coverage = report['x-dsh-vet']!.coverage
      expect(validateReport(report).issues).toEqual([])
      expect(coverage.candidateJs).toBe(1)
      expect(coverage.omissions).toEqual([{ reason: 'symlink', path: 'link.js' }])
      expect(coverage.status).toBe('partial')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('carries the archive digest from npm resolution into the subject', async () => {
    const tarball = gzippedTar([
      { name: 'package/package.json', data: '{"name":"arch-demo","version":"1.0.0","main":"index.js"}' },
      { name: 'package/index.js', data: 'export const x = 1' },
    ])
    const integrity = `sha512-${createHash('sha512').update(tarball).digest('base64')}`
    const packument = {
      'dist-tags': { latest: '1.0.0' },
      versions: {
        '1.0.0': { version: '1.0.0', dist: { tarball: 'https://registry.example/arch-demo-1.0.0.tgz', integrity } },
      },
    }
    const fetchImpl = async (url: string) =>
      url.endsWith('.tgz') ? fakeFetchBody(tarball) : fakeResponse(packument)
    const report = await scan('arch-demo@1.0.0', { fetchImpl, registry: 'https://registry.example', now: NOW })
    const subject = report['x-dsh-vet']!.subject
    expect(validateReport(report).issues).toEqual([])
    expect(subject.packageName).toBe('arch-demo')
    expect(subject.archiveDigest).toBe(`sha256:${createHash('sha256').update(tarball).digest('hex')}`)
    expect(report['x-dsh-vet']!.coverage.status).toBe('complete')
  })

  it('records skipped archive links as omissions', async () => {
    const tarball = gzippedTar([
      { name: 'package/package.json', data: '{"name":"link-arch","version":"1.0.0","main":"index.js"}' },
      { name: 'package/index.js', data: 'export const x = 1' },
      { name: 'package/bin', type: '2', linkname: '../index.js', mode: 0o755 },
    ])
    const integrity = `sha512-${createHash('sha512').update(tarball).digest('base64')}`
    const packument = {
      'dist-tags': { latest: '1.0.0' },
      versions: {
        '1.0.0': { version: '1.0.0', dist: { tarball: 'https://registry.example/link-arch-1.0.0.tgz', integrity } },
      },
    }
    const fetchImpl = async (url: string) =>
      url.endsWith('.tgz') ? fakeFetchBody(tarball) : fakeResponse(packument)
    const report = await scan('link-arch@1.0.0', { fetchImpl, registry: 'https://registry.example', now: NOW })
    const coverage = report['x-dsh-vet']!.coverage
    expect(validateReport(report).issues).toEqual([])
    expect(coverage.omissions).toEqual([
      { reason: 'archive-link-skipped', path: 'bin', detail: 'symlink → ../index.js' },
    ])
    expect(coverage.status).toBe('partial')
  })
})
