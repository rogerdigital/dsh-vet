/**
 * The `x-dsh-vet` scan-context extension, version 1: what a report
 * actually checked, attached optionally to a `dsh-vet/v1` report. See
 * `docs/scan-context-v1.md` for the normative spec.
 *
 * Three properties are encoded here, not just documented:
 * - Optional and versioned apart: a report without the extension is a
 *   valid legacy report, and its coverage is unknown — never complete.
 * - Tolerant consumers, strict version 1: unknown fields are ignored, but
 *   a version-1 payload that violates the spec is malformed and rejected.
 *   A future integer version is tolerated as a base report and reported
 *   as unsupported — never trusted comparison metadata.
 * - Digests are deterministic: both the profile digest and the
 * analysis-input digest hash a canonical JSON encoding defined once here.
 *
 * @module dsh-vet/scan-context
 */

import { createHash } from 'node:crypto'
import { RULE_ID_PATTERN } from './contract.ts'
import type { ValidationIssue } from './validate.ts'

/** Report-envelope key carrying the extension. */
export const SCAN_CONTEXT_KEY = 'x-dsh-vet' as const

/** Extension version this module defines and validates. */
export const SCAN_CONTEXT_VERSION = 1 as const

/** Digest semantics identifier for `subject.analysisInputDigest`. */
export const ANALYSIS_INPUT_DIGEST_KIND = 'dsh-vet/analysis-input@1' as const

/** `sha256:<64 lowercase hex>` — the only digest syntax version 1 allows. */
export const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/

export interface ScanProfileV1 {
  /** Engine identity + revision, e.g. `dsh-vet-analyzer/0.3.0`. */
  readonly analyzerRevision: string
  /** Rule catalog identity + revision, e.g. `dsh-vet-rules/0.3.0`. */
  readonly ruleCatalogRevision: string
  /** Sorted unique effective rule ids, including automatic checks. */
  readonly rules: readonly string[]
  /** Effective scan options as they affected findings; JSON-safe values. */
  readonly options: Readonly<Record<string, unknown>>
  /** `sha256:<hex>` over the canonical JSON of the four fields above. */
  readonly digest: string
}

export type ScanCoverageStatus = 'complete' | 'partial' | 'unknown'

/** Only value in version 1; dependencies are never scanned. */
export type DependencyMode = 'not-scanned'

export interface ScanOmissionV1 {
  /** Stable machine-readable reason, e.g. `unsupported-executable-format`. */
  readonly reason: string
  /** Relative path (or scope marker) the omission applies to. */
  readonly path: string
  readonly detail?: string
}

export interface ScanCoverageV1 {
  readonly status: ScanCoverageStatus
  /** Candidate JS files in the documented scope. */
  readonly candidateJs: number
  /** Candidates the analyzer parsed. */
  readonly parsed: number
  /** Candidates that failed parsing; equals `failedFiles.length`. */
  readonly parseFailures: number
  /** Sorted unique relative paths of parse failures. */
  readonly failedFiles: readonly string[]
  readonly entries: {
    /** Sorted unique declared entry hints found. */
    readonly resolved: readonly string[]
    /** Sorted unique declared entry hints not found. */
    readonly unresolved: readonly string[]
  }
  /** Known omissions, sorted by `path` then `reason`, unique on that pair. */
  readonly omissions: readonly ScanOmissionV1[]
  readonly dependencyMode: DependencyMode
  /** Sorted unique fixed limitations, listed even when `complete`. */
  readonly limitations: readonly string[]
}

export interface ScanSubjectV1 {
  /** Package name when the target has one. */
  readonly packageName?: string
  /** `sha256:<hex>` over the canonical analysis-input manifest. */
  readonly analysisInputDigest: string
  readonly digestKind: typeof ANALYSIS_INPUT_DIGEST_KIND
  /** `sha256:<hex>` over exact archive bytes, when an archive was consumed. */
  readonly archiveDigest?: string
}

export interface ScanObservationV1 {
  /** Stable observation kind, e.g. `outbound-host`. */
  readonly kind: string
  /** Relative path of the observing evidence. */
  readonly file: string
  /** Normalized semantic subject (hostname, capability name, …). */
  readonly subject: string
  /** Duplicate identical observations as counts; default 1. */
  readonly count?: number
}

export interface ScanContextV1 {
  readonly version: typeof SCAN_CONTEXT_VERSION
  readonly profile: ScanProfileV1
  readonly coverage: ScanCoverageV1
  readonly subject: ScanSubjectV1
  readonly observations: readonly ScanObservationV1[]
}

/**
 * Canonical JSON: object keys sorted by UTF-16 code unit order, no
 * whitespace, `undefined`-valued keys omitted, non-finite numbers encoded
 * as `null`. Both digest computations hash this encoding; emitters must
 * match it byte for byte.
 */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`
  }
  if (typeof value === 'object' && value !== null) {
    const keys = Object.keys(value)
      .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
      .sort()
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`)
      .join(',')}}`
  }
  if (typeof value === 'number' && !Number.isFinite(value)) return 'null'
  return JSON.stringify(value) ?? 'null'
}

/** SHA-256 as lowercase hex over the UTF-8 bytes of the input. */
export function sha256Hex(data: string | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex')
}

/** Deterministic profile digest over the canonical JSON of the profile fields. */
export function profileDigest(profile: Omit<ScanProfileV1, 'digest'>): string {
  return `sha256:${sha256Hex(
    canonicalJson({
      analyzerRevision: profile.analyzerRevision,
      ruleCatalogRevision: profile.ruleCatalogRevision,
      rules: profile.rules,
      options: profile.options,
    }),
  )}`
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value)
}

function show(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value)
  if (Array.isArray(value)) return 'an array'
  if (isObject(value)) return 'an object'
  return String(value)
}

/** Lexicographic by Unicode code units — the deterministic order everywhere here. */
function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * Outcome of examining a report's extension: absent (legacy), validated,
 * malformed, or a future version that stays a valid base report but is
 * never trusted comparison metadata.
 */
export type ScanContextCheck =
  | { readonly state: 'absent' }
  | { readonly state: 'unsupported'; readonly version: number }
  | { readonly state: 'validated'; readonly context: ScanContextV1 }
  | { readonly state: 'invalid'; readonly issues: ValidationIssue[] }

/**
 * Pure check of the `x-dsh-vet` extension on a parsed report. Collects
 * every issue instead of failing on the first, mirroring
 * {@link import('./validate.ts').validateReport}.
 */
export function checkScanContext(report: unknown): ScanContextCheck {
  if (!isObject(report) || report[SCAN_CONTEXT_KEY] === undefined) {
    return { state: 'absent' }
  }
  const value = report[SCAN_CONTEXT_KEY]
  const at = SCAN_CONTEXT_KEY
  if (!isObject(value)) {
    return { state: 'invalid', issues: [{ path: at, message: `must be an object, got ${show(value)}` }] }
  }
  const version = value.version
  if (!isInt(version) || version < 1) {
    return {
      state: 'invalid',
      issues: [{ path: `${at}.version`, message: `must be a positive integer, got ${show(version)}` }],
    }
  }
  if (version !== SCAN_CONTEXT_VERSION) {
    return { state: 'unsupported', version }
  }
  const issues = validateContextV1(value, at)
  if (issues.length > 0) return { state: 'invalid', issues }
  return { state: 'validated', context: value as unknown as ScanContextV1 }
}

function validateContextV1(context: Record<string, unknown>, at: string): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const fail = (path: string, message: string): void => {
    issues.push({ path, message })
  }

  if (!isObject(context.profile)) {
    fail(`${at}.profile`, `must be an object, got ${show(context.profile)}`)
  } else {
    const profile = context.profile
    for (const key of ['analyzerRevision', 'ruleCatalogRevision'] as const) {
      if (typeof profile[key] !== 'string' || profile[key] === '') {
        fail(`${at}.profile.${key}`, `must be a non-empty string, got ${show(profile[key])}`)
      }
    }
    const rulesShapeOk = checkStringArray(profile.rules, `${at}.profile.rules`, fail, { nonEmpty: true })
    if (rulesShapeOk) {
      const rules = profile.rules as unknown as string[]
      for (const rule of rules) {
        if (!RULE_ID_PATTERN.test(rule)) {
          fail(`${at}.profile.rules`, `must contain valid rule ids, got ${show(rule)} (vendor rule sets prefix their own segment, e.g. acme.eval-detect)`)
        }
      }
    }
    if (!isObject(profile.options)) {
      fail(`${at}.profile.options`, `must be an object, got ${show(profile.options)}`)
    }
    if (typeof profile.digest !== 'string' || !SHA256_PATTERN.test(profile.digest)) {
      fail(`${at}.profile.digest`, `must match sha256:<64 lowercase hex>, got ${show(profile.digest)}`)
    } else if (rulesShapeOk && isObject(profile.options)) {
      const derived = profileDigest({
        analyzerRevision: profile.analyzerRevision as string,
        ruleCatalogRevision: profile.ruleCatalogRevision as string,
        rules: profile.rules as unknown as string[],
        options: profile.options,
      })
      if (profile.digest !== derived) {
        fail(`${at}.profile.digest`, `${show(profile.digest)} does not match the profile fields, which derive ${JSON.stringify(derived)} — the digest is always derived, never asserted`)
      }
    }
  }

  if (!isObject(context.coverage)) {
    fail(`${at}.coverage`, `must be an object, got ${show(context.coverage)}`)
  } else {
    const coverage = context.coverage
    const STATUSES = ['complete', 'partial', 'unknown'] as const
    if (!STATUSES.includes(coverage.status as never)) {
      fail(`${at}.coverage.status`, `must be one of ${STATUSES.map((s) => JSON.stringify(s)).join(' | ')}, got ${show(coverage.status)}`)
    }
    const counts: Array<[string, number | undefined]> = []
    let countsOk = true
    for (const key of ['candidateJs', 'parsed', 'parseFailures'] as const) {
      const value = coverage[key]
      if (!isInt(value) || value < 0) {
        fail(`${at}.coverage.${key}`, `must be a non-negative integer, got ${show(value)}`)
        countsOk = false
      } else {
        counts.push([key, value])
      }
    }
    const failedFilesOk = checkStringArray(coverage.failedFiles, `${at}.coverage.failedFiles`, fail, { nonEmpty: true })
    const entries = isObject(coverage.entries) ? coverage.entries : undefined
    if (!entries) {
      fail(`${at}.coverage.entries`, `must be an object, got ${show(coverage.entries)}`)
    } else {
      checkStringArray(entries.resolved, `${at}.coverage.entries.resolved`, fail, { nonEmpty: true })
      checkStringArray(entries.unresolved, `${at}.coverage.entries.unresolved`, fail, { nonEmpty: true })
    }
    const omissionsOk = checkOmissions(coverage.omissions, `${at}.coverage.omissions`, fail)
    if (coverage.dependencyMode !== 'not-scanned') {
      fail(`${at}.coverage.dependencyMode`, `must be "not-scanned" in version 1, got ${show(coverage.dependencyMode)}`)
    }
    checkStringArray(coverage.limitations, `${at}.coverage.limitations`, fail, { nonEmpty: true })

    if (countsOk) {
      const candidateJs = coverage.candidateJs as number
      const parsed = coverage.parsed as number
      const parseFailures = coverage.parseFailures as number
      if (parsed > candidateJs) {
        fail(`${at}.coverage.parsed`, `must not exceed candidateJs (${candidateJs}), got ${parsed}`)
      }
      if (failedFilesOk && parseFailures !== (coverage.failedFiles as string[]).length) {
        fail(`${at}.coverage.parseFailures`, `must equal failedFiles.length (${(coverage.failedFiles as string[]).length}), got ${parseFailures}`)
      }
      if (parsed + parseFailures > candidateJs) {
        fail(`${at}.coverage.parseFailures`, `parsed + parseFailures must not exceed candidateJs (${candidateJs})`)
      }
    }
    if (coverage.status === 'complete') {
      if (countsOk && (coverage.candidateJs as number) < 1) {
        fail(`${at}.coverage.status`, `"complete" requires candidateJs >= 1 — zero-JS targets are partial`)
      }
      if (countsOk && (coverage.parseFailures as number) !== 0) {
        fail(`${at}.coverage.status`, `"complete" requires parseFailures = 0, got ${coverage.parseFailures}`)
      }
      if (failedFilesOk && (coverage.failedFiles as string[]).length > 0) {
        fail(`${at}.coverage.status`, `"complete" requires no failed files, got ${(coverage.failedFiles as string[]).length}`)
      }
      if (entries && Array.isArray(entries.unresolved) && entries.unresolved.length > 0) {
        fail(`${at}.coverage.status`, `"complete" requires no unresolved entries, got ${entries.unresolved.length}`)
      }
      if (omissionsOk && Array.isArray(coverage.omissions) && coverage.omissions.length > 0) {
        fail(`${at}.coverage.status`, `"complete" requires no omissions, got ${coverage.omissions.length}`)
      }
    }
  }

  if (!isObject(context.subject)) {
    fail(`${at}.subject`, `must be an object, got ${show(context.subject)}`)
  } else {
    const subject = context.subject
    if (subject.packageName !== undefined && (typeof subject.packageName !== 'string' || subject.packageName === '')) {
      fail(`${at}.subject.packageName`, `must be a non-empty string when present, got ${show(subject.packageName)}`)
    }
    if (typeof subject.analysisInputDigest !== 'string' || !SHA256_PATTERN.test(subject.analysisInputDigest)) {
      fail(`${at}.subject.analysisInputDigest`, `must match sha256:<64 lowercase hex>, got ${show(subject.analysisInputDigest)}`)
    }
    if (subject.digestKind !== ANALYSIS_INPUT_DIGEST_KIND) {
      fail(`${at}.subject.digestKind`, `must be ${JSON.stringify(ANALYSIS_INPUT_DIGEST_KIND)}, got ${show(subject.digestKind)}`)
    }
    if (subject.archiveDigest !== undefined && (typeof subject.archiveDigest !== 'string' || !SHA256_PATTERN.test(subject.archiveDigest))) {
      fail(`${at}.subject.archiveDigest`, `must match sha256:<64 lowercase hex> when present, got ${show(subject.archiveDigest)}`)
    }
  }

  if (!Array.isArray(context.observations)) {
    fail(`${at}.observations`, `must be an array, got ${show(context.observations)}`)
  } else {
    const observations = context.observations
    let shapeOk = true
    observations.forEach((raw, i) => {
      const obsAt = `${at}.observations[${i}]`
      if (!isObject(raw)) {
        fail(obsAt, `must be an object, got ${show(raw)}`)
        shapeOk = false
        return
      }
      for (const key of ['kind', 'file', 'subject'] as const) {
        if (typeof raw[key] !== 'string' || raw[key] === '') {
          fail(`${obsAt}.${key}`, `must be a non-empty string, got ${show(raw[key])}`)
          shapeOk = false
        }
      }
      if (raw.count !== undefined && (!isInt(raw.count) || raw.count < 1)) {
        fail(`${obsAt}.count`, `must be an integer >= 1 when present, got ${show(raw.count)}`)
        shapeOk = false
      }
    })
    if (shapeOk) {
      const triple = (o: Record<string, unknown>): string =>
        `${o.kind as string}\0${o.file as string}\0${o.subject as string}`
      for (let i = 1; i < observations.length; i++) {
        const prev = triple(observations[i - 1] as Record<string, unknown>)
        const cur = triple(observations[i] as Record<string, unknown>)
        if (prev === cur) {
          fail(`${at}.observations`, `duplicate observation identity ${show(cur.replace(/\0/g, ' | '))} — duplicates are represented as counts, not repeated entries`)
          break
        }
        if (compare(prev, cur) > 0) {
          fail(`${at}.observations`, 'must be sorted by kind, then file, then subject')
          break
        }
      }
    }
  }

  return issues
}

/** Check an array of strings for sortedness and uniqueness; false when malformed. */
function checkStringArray(
  value: unknown,
  path: string,
  fail: (path: string, message: string) => void,
  options: { nonEmpty: boolean },
): value is string[] {
  if (!Array.isArray(value)) {
    fail(path, `must be an array, got ${show(value)}`)
    return false
  }
  for (const item of value) {
    if (typeof item !== 'string' || (options.nonEmpty && item === '')) {
      fail(path, `must contain ${options.nonEmpty ? 'non-empty ' : ''}strings, got ${show(item)}`)
      return false
    }
  }
  for (let i = 1; i < value.length; i++) {
    if (value[i - 1] === value[i]) {
      fail(path, `must not contain duplicates, got ${show(value[i])}`)
      return false
    }
    if (compare(value[i - 1]!, value[i]!) > 0) {
      fail(path, `must be sorted, got ${show(value[i - 1])} before ${show(value[i])}`)
      return false
    }
  }
  return true
}

function checkOmissions(
  value: unknown,
  path: string,
  fail: (path: string, message: string) => void,
): boolean {
  if (!Array.isArray(value)) {
    fail(path, `must be an array, got ${show(value)}`)
    return false
  }
  for (const raw of value) {
    if (!isObject(raw) || typeof raw.reason !== 'string' || raw.reason === '' || typeof raw.path !== 'string' || raw.path === '') {
      fail(path, `must contain objects with non-empty reason and path strings, got ${show(raw)}`)
      return false
    }
    if (raw.detail !== undefined && typeof raw.detail !== 'string') {
      fail(path, `detail must be a string when present, got ${show(raw.detail)}`)
      return false
    }
  }
  for (let i = 1; i < value.length; i++) {
    const prev = value[i - 1] as Record<string, unknown>
    const cur = value[i] as Record<string, unknown>
    const prevKey = `${prev.path as string}\0${prev.reason as string}`
    const curKey = `${cur.path as string}\0${cur.reason as string}`
    if (prevKey === curKey) {
      fail(path, `must not contain duplicate path+reason pairs, got ${show(cur.path)}`)
      return false
    }
    if (compare(prevKey, curKey) > 0) {
      fail(path, `must be sorted by path, then reason, got ${show(prev.path)} before ${show(cur.path)}`)
      return false
    }
  }
  return true
}
