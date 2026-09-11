import { describe, expect, it } from 'vitest'
import { createReport } from '../src/contract.ts'
import {
  ANALYSIS_INPUT_DIGEST_KIND,
  canonicalJson,
  checkScanContext,
  profileDigest,
  sha256Hex,
} from '../src/scan-context.ts'
import type { ScanContextV1 } from '../src/scan-context.ts'
import { validateReport } from '../src/validate.ts'

const scanner = { name: 'dsh-vet', version: '0.3.0', ranAt: '2026-01-01T00:00:00Z' }
const target = { kind: 'npm-package' as const, specifier: 'example-plugin@1.2.3' }

function validContext(): ScanContextV1 {
  const profile = {
    analyzerRevision: 'dsh-vet-analyzer/0.3.0',
    ruleCatalogRevision: 'dsh-vet-rules/0.3.0',
    rules: ['dep.postinstall-script', 'scan.empty-audit'],
    options: { includeSnippets: true },
  }
  return {
    version: 1,
    profile: { ...profile, digest: profileDigest(profile) },
    coverage: {
      status: 'partial',
      candidateJs: 3,
      parsed: 2,
      parseFailures: 1,
      failedFiles: ['broken.js'],
      entries: { resolved: ['index.js'], unresolved: [] },
      omissions: [],
      dependencyMode: 'not-scanned',
      limitations: ['static analysis of JavaScript sources only'],
    },
    subject: {
      packageName: 'example-plugin',
      analysisInputDigest: `sha256:${'a'.repeat(64)}`,
      digestKind: ANALYSIS_INPUT_DIGEST_KIND,
    },
    observations: [{ kind: 'outbound-host', file: 'index.js', subject: 'api.example.com' }],
  }
}

function completeContext(): ScanContextV1 {
  const context = validContext()
  return {
    ...context,
    coverage: {
      ...context.coverage,
      status: 'complete' as const,
      candidateJs: 2,
      parsed: 2,
      parseFailures: 0,
      failedFiles: [],
      omissions: [],
    },
  }
}

/** Clone the valid fixture, mutate it, and wrap it in a base report. */
function reportWith(fn: (context: any) => void): unknown {
  const context = structuredClone(validContext())
  fn(context)
  return createReport({ target, scanner, findings: [], context: context as never })
}

describe('canonicalJson', () => {
  it('sorts object keys at every depth, independent of insertion order', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe(canonicalJson({ a: { c: 3, d: 2 }, b: 1 }))
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}')
  })

  it('preserves array order and omits undefined-valued keys', () => {
    expect(canonicalJson(['b', 'a'])).toBe('["b","a"]')
    expect(canonicalJson({ a: undefined, b: 1 } as Record<string, unknown>)).toBe('{"b":1}')
  })

  it('encodes non-finite numbers as null', () => {
    expect(canonicalJson({ a: Number.NaN })).toBe('{"a":null}')
  })
})

describe('sha256Hex and profileDigest', () => {
  it('matches the known empty-input SHA-256 vector', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  })

  it('derives the same profile digest from differently ordered input', () => {
    const left = { analyzerRevision: 'a/1', ruleCatalogRevision: 'r/1', rules: ['a.b', 'c.d'], options: { x: 1, y: { z: 2 } } }
    const right = { options: { y: { z: 2 }, x: 1 }, rules: ['a.b', 'c.d'], ruleCatalogRevision: 'r/1', analyzerRevision: 'a/1' }
    expect(profileDigest(left)).toBe(profileDigest(right))
  })

  it('changes when the rule selection changes', () => {
    const base = { analyzerRevision: 'a/1', ruleCatalogRevision: 'r/1', rules: ['a.b'], options: {} }
    expect(profileDigest({ ...base, rules: ['a.b', 'c.d'] })).not.toBe(profileDigest(base))
  })
})

describe('checkScanContext', () => {
  it('reports absent context for legacy reports and non-reports', () => {
    expect(checkScanContext(createReport({ target, scanner, findings: [] }))).toEqual({ state: 'absent' })
    expect(checkScanContext('not a report')).toEqual({ state: 'absent' })
  })

  it('validates a well-formed version-1 context', () => {
    const check = checkScanContext(reportWith(() => {}))
    expect(check).toMatchObject({ state: 'validated' })
  })

  it('rejects a non-object extension and a malformed version', () => {
    const notObject = createReport({ target, scanner, findings: [] })
    ;(notObject as unknown as Record<string, unknown>)['x-dsh-vet'] = 7
    expect(checkScanContext(notObject)).toMatchObject({ state: 'invalid' })

    for (const version of [undefined, 'one', 0, -1, 1.5]) {
      const check = checkScanContext(reportWith((c) => { c.version = version }))
      expect(check).toMatchObject({ state: 'invalid' })
      expect((check as { issues: { path: string }[] }).issues[0]!.path).toBe('x-dsh-vet.version')
    }
  })

  it('tolerates a future version as unsupported context, never validated', () => {
    const check = checkScanContext(reportWith((c) => { c.version = 2 }))
    expect(check).toEqual({ state: 'unsupported', version: 2 })
    expect(validateReport(reportWith((c) => { c.version = 2 })).ok).toBe(true)
  })

  it('rejects duplicate, unsorted, empty, and invalid rule ids', () => {
    const duplicate = checkScanContext(reportWith((c) => { c.profile.rules = ['scan.empty-audit', 'scan.empty-audit'] }))
    expect(duplicate).toMatchObject({ state: 'invalid' })
    expect((duplicate as { issues: { path: string }[] }).issues[0]!.path).toBe('x-dsh-vet.profile.rules')

    const unsorted = checkScanContext(reportWith((c) => { c.profile.rules = ['scan.empty-audit', 'dep.postinstall-script'] }))
    expect(unsorted).toMatchObject({ state: 'invalid' })

    const empty = checkScanContext(reportWith((c) => { c.profile.rules = [] }))
    expect(empty).toMatchObject({ state: 'invalid' })

    const invalid = checkScanContext(reportWith((c) => { c.profile.rules = ['NoDots'] }))
    expect(invalid).toMatchObject({ state: 'invalid' })
  })

  it('rejects an asserted profile digest that the fields do not derive', () => {
    const mismatch = checkScanContext(reportWith((c) => { c.profile.digest = `sha256:${'0'.repeat(64)}` }))
    expect(mismatch).toMatchObject({ state: 'invalid' })
    expect((mismatch as { issues: { path: string }[] }).issues[0]!.path).toBe('x-dsh-vet.profile.digest')

    const syntax = checkScanContext(reportWith((c) => { c.profile.digest = 'sha256:short' }))
    expect(syntax).toMatchObject({ state: 'invalid' })
  })

  it('rejects malformed counts and broken cross-count invariants', () => {
    const parsedOverCandidates = checkScanContext(reportWith((c) => { c.coverage.parsed = 4 }))
    expect(parsedOverCandidates).toMatchObject({ state: 'invalid' })
    expect((parsedOverCandidates as { issues: { path: string }[] }).issues[0]!.path).toBe('x-dsh-vet.coverage.parsed')

    const failuresWithoutFiles = checkScanContext(reportWith((c) => { c.coverage.parseFailures = 2 }))
    expect(failuresWithoutFiles).toMatchObject({ state: 'invalid' })

    const sumOverCandidates = checkScanContext(
      reportWith((c) => {
        c.coverage.candidateJs = 2
        c.coverage.failedFiles = ['broken.js', 'also-broken.js']
        c.coverage.parseFailures = 2
      }),
    )
    expect(sumOverCandidates).toMatchObject({ state: 'invalid' })

    const negative = checkScanContext(reportWith((c) => { c.coverage.candidateJs = -1 }))
    expect(negative).toMatchObject({ state: 'invalid' })

    const unsortedFailures = checkScanContext(
      reportWith((c) => {
        c.coverage.candidateJs = 4
        c.coverage.parsed = 2
        c.coverage.parseFailures = 2
        c.coverage.failedFiles = ['z-first.js', 'a-second.js']
      }),
    )
    expect(unsortedFailures).toMatchObject({ state: 'invalid' })
  })

  it('rejects a complete status that the coverage counters contradict', () => {
    const withFailures = checkScanContext(reportWith((c) => { c.coverage.status = 'complete' }))
    expect(withFailures).toMatchObject({ state: 'invalid' })
    expect((withFailures as { issues: { path: string }[] }).issues.some((i) => i.path === 'x-dsh-vet.coverage.status')).toBe(true)

    const zeroJs = checkScanContext(
      reportWith((c) => {
        c.coverage.status = 'complete'
        c.coverage.candidateJs = 0
        c.coverage.parsed = 0
        c.coverage.parseFailures = 0
        c.coverage.failedFiles = []
      }),
    )
    expect(zeroJs).toMatchObject({ state: 'invalid' })

    const unresolvedEntry = checkScanContext(
      reportWith((c) => {
        c.coverage = (completeContext() as any).coverage
        c.coverage.entries = { resolved: ['index.js'], unresolved: ['missing.js'] }
      }),
    )
    expect(unresolvedEntry).toMatchObject({ state: 'invalid' })

    const omission = checkScanContext(
      reportWith((c) => {
        c.coverage = (completeContext() as any).coverage
        c.coverage.omissions = [{ reason: 'unsupported-executable-format', path: 'tool.bin' }]
      }),
    )
    expect(omission).toMatchObject({ state: 'invalid' })
  })

  it('accepts a coherent complete context', () => {
    expect(checkScanContext(reportWith((c) => { c.coverage = (completeContext() as any).coverage }))).toMatchObject({
      state: 'validated',
    })
  })

  it('checks subject digest syntax and kind', () => {
    const digest = checkScanContext(reportWith((c) => { c.subject.analysisInputDigest = 'sha512:abc' }))
    expect(digest).toMatchObject({ state: 'invalid' })
    expect((digest as { issues: { path: string }[] }).issues[0]!.path).toBe('x-dsh-vet.subject.analysisInputDigest')

    const kind = checkScanContext(reportWith((c) => { c.subject.digestKind = 'dsh-vet/analysis-input@2' }))
    expect(kind).toMatchObject({ state: 'invalid' })

    const archive = checkScanContext(reportWith((c) => { c.subject.archiveDigest = 'sha256:uppercaseABC' }))
    expect(archive).toMatchObject({ state: 'invalid' })
  })

  it('checks omissions shape, sorting, and uniqueness', () => {
    const malformed = checkScanContext(reportWith((c) => { c.coverage.omissions = [{ reason: '', path: 'x' }] }))
    expect(malformed).toMatchObject({ state: 'invalid' })

    const unsorted = checkScanContext(
      reportWith((c) => {
        c.coverage.candidateJs = 4
        c.coverage.omissions = [
          { reason: 'a', path: 'z.js' },
          { reason: 'b', path: 'a.js' },
        ]
      }),
    )
    expect(unsorted).toMatchObject({ state: 'invalid' })

    const duplicatePair = checkScanContext(
      reportWith((c) => {
        c.coverage.candidateJs = 4
        c.coverage.omissions = [
          { reason: 'a', path: 'x.js' },
          { reason: 'a', path: 'x.js' },
        ]
      }),
    )
    expect(duplicatePair).toMatchObject({ state: 'invalid' })
  })

  it('rejects any dependency mode other than not-scanned', () => {
    const check = checkScanContext(reportWith((c) => { c.coverage.dependencyMode = 'scoped' }))
    expect(check).toMatchObject({ state: 'invalid' })
  })

  it('rejects unsorted, duplicate, or malformed observations', () => {
    const unsorted = checkScanContext(
      reportWith((c) => {
        c.observations = [
          { kind: 'outbound-host', file: 'index.js', subject: 'z.example.com' },
          { kind: 'outbound-host', file: 'index.js', subject: 'a.example.com' },
        ]
      }),
    )
    expect(unsorted).toMatchObject({ state: 'invalid' })

    const duplicate = checkScanContext(
      reportWith((c) => {
        c.observations = [
          { kind: 'outbound-host', file: 'index.js', subject: 'api.example.com' },
          { kind: 'outbound-host', file: 'index.js', subject: 'api.example.com' },
        ]
      }),
    )
    expect(duplicate).toMatchObject({ state: 'invalid' })

    const count = checkScanContext(reportWith((c) => { c.observations[0].count = 0 }))
    expect(count).toMatchObject({ state: 'invalid' })

    const missingSubject = checkScanContext(reportWith((c) => { c.observations[0].subject = '' }))
    expect(missingSubject).toMatchObject({ state: 'invalid' })
  })

  it('tolerates unknown vendor fields inside a version-1 context', () => {
    const check = checkScanContext(reportWith((c) => { c['x-vendor-extra'] = { anything: true } }))
    expect(check).toMatchObject({ state: 'validated' })
  })
})

describe('validateReport integration with scan context', () => {
  it('accepts a report with a valid extension and rejects a malformed one', () => {
    expect(validateReport(reportWith(() => {})).ok).toBe(true)
    const invalid = validateReport(reportWith((c) => { c.coverage.parsed = 99 }))
    expect(invalid.ok).toBe(false)
    expect(invalid.issues[0]!.path).toBe('x-dsh-vet.coverage.parsed')
  })

  it('keeps legacy reports valid and unknown-extension reports valid', () => {
    expect(validateReport(createReport({ target, scanner, findings: [] })).ok).toBe(true)
    expect(validateReport(reportWith((c) => { c.version = 2 })).ok).toBe(true)
  })
})

describe('createReport context attachment', () => {
  it('attaches the context under x-dsh-vet only when provided', () => {
    const withContext = createReport({ target, scanner, findings: [], context: validContext() })
    expect((withContext as unknown as Record<string, unknown>)['x-dsh-vet']).toEqual(validContext())
    const without = createReport({ target, scanner, findings: [] })
    expect((without as unknown as Record<string, unknown>)['x-dsh-vet']).toBeUndefined()
  })
})
