/**
 * The `dsh-vet/v1` report contract: a machine-readable, implementation-
 * agnostic audit report for DeepSeek Harness (DSH) plugins. Any scanner may
 * emit it; any marketplace, CI job, or UI may consume it. See
 * `docs/dsh-vet-v1.md` for the normative spec.
 *
 * Two design rules are encoded here, not just documented:
 * - Findings are signals, not verdicts: a finding with `low` confidence never
 *   lowers a grade, and `info` severity never does either.
 * - Reports are deterministic: findings are sorted, and the summary is always
 *   derived, never asserted by the emitter.
 *
 * @module dsh-vet/contract
 */

/** Literal `schema` value every dsh-vet/v1 report carries. */
export const SCHEMA_ID = 'dsh-vet/v1' as const

/** How bad a finding is. `info` never affects a grade. */
export type VetSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info'

/** How sure the scanner is that the finding is real. `low` never affects a grade. */
export type VetConfidence = 'high' | 'medium' | 'low'

/** Grade derived from graded findings. `X` marks an incomplete or errored scan. */
export type VetGrade = 'A' | 'B' | 'C' | 'D' | 'F' | 'X'

export interface VetEvidence {
  /** Path within the audited package, e.g. `host-half.js`. */
  file: string
  /** 1-based line of the evidence, when known. */
  line?: number
  /** Minimal verbatim snippet; never include secrets. */
  snippet?: string
  /** What the evidence shows, one sentence. */
  note?: string
}

export interface VetFinding {
  /**
   * Namespaced rule id, e.g. `perm.broad-fs-write` or a vendor-prefixed
   * `acme.eval-detect`. Must match {@link RULE_ID_PATTERN}; two or more
   * dot-separated segments so third-party rule sets never collide.
   */
  id: string
  /** One-line human title, e.g. `Writes outside the declared workspace`. */
  title: string
  severity: VetSeverity
  confidence: VetConfidence
  evidence: VetEvidence[]
  /** How to make the finding go away, when actionable. */
  remediation?: string
  /** URLs to rule documentation. */
  references?: string[]
}

export type VetTargetKind = 'npm-package' | 'git-repo' | 'local-path'

export interface VetTarget {
  kind: VetTargetKind
  /** What was audited, e.g. `dsh-vault@1.10.6`, a git URL, or a path. */
  specifier: string
  /** What the specifier resolved to, when applicable. */
  resolved?: {
    version?: string
    commit?: string
    /** Subresource integrity of the exact artifact that was scanned. */
    integrity?: string
  }
}

export interface VetScanner {
  /** Emitting implementation, e.g. `dsh-vet`. */
  name: string
  version: string
  /** RFC 3339 timestamp of the run. */
  ranAt: string
}

export interface VetSummaryCounts {
  critical: number
  high: number
  medium: number
  low: number
  info: number
}

export interface VetSummary {
  grade: VetGrade
  counts: VetSummaryCounts
}

export interface VetReport {
  readonly schema: typeof SCHEMA_ID
  readonly target: VetTarget
  readonly scanner: VetScanner
  readonly summary: VetSummary
  readonly findings: readonly VetFinding[]
}

/** Sort rank per severity, worst first; the contract's deterministic order. */
export const SEVERITY_RANK: Record<VetSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
}

/**
 * Rule ids are two or more dot-separated lowercase segments
 * (`perm.broad-fs-write`, `acme.eval-detect`). Deliberately open-ended about
 * segment count so vendor-prefixed rule sets work — a closed single-segment
 * pattern is how the dsh-doctor contract initially broke third-party ids.
 */
export const RULE_ID_PATTERN = /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/

/** True when a finding participates in grading: not `info`, not low-confidence. */
export function isGraded(finding: VetFinding): boolean {
  return finding.severity !== 'info' && finding.confidence !== 'low'
}

/** Per-severity finding totals. */
export function countFindings(findings: readonly VetFinding[]): VetSummaryCounts {
  const counts: VetSummaryCounts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 }
  for (const finding of findings) {
    counts[finding.severity] += 1
  }
  return counts
}

/**
 * Derive the grade from graded findings only: worst severity decides.
 * `low`-confidence and `info` findings are reported but never lower a grade.
 */
export function gradeFor(findings: readonly VetFinding[]): Exclude<VetGrade, 'X'> {
  let worst: VetSeverity | undefined
  for (const finding of findings) {
    if (!isGraded(finding)) continue
    if (worst === undefined || SEVERITY_RANK[finding.severity] < SEVERITY_RANK[worst]) {
      worst = finding.severity
    }
  }
  switch (worst) {
    case undefined:
    case 'info':
      return 'A'
    case 'low':
      return 'B'
    case 'medium':
      return 'C'
    case 'high':
      return 'D'
    case 'critical':
      return 'F'
  }
}

export interface CreateReportInput {
  target: VetTarget
  scanner: VetScanner
  findings: readonly VetFinding[]
}

/**
 * Build a normalized report: validates rule ids, sorts findings
 * deterministically (worst severity first, then id ascending), and derives
 * the summary. Emitters must go through this instead of assembling a report
 * by hand — it is what keeps two runs over the same artifact identical.
 */
export function createReport(input: CreateReportInput): VetReport {
  for (const finding of input.findings) {
    if (!RULE_ID_PATTERN.test(finding.id)) {
      throw new Error(`invalid dsh-vet/v1 rule id: ${JSON.stringify(finding.id)}`)
    }
  }
  const findings = [...input.findings].sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.id.localeCompare(b.id),
  )
  return {
    schema: SCHEMA_ID,
    target: input.target,
    scanner: input.scanner,
    summary: { grade: gradeFor(findings), counts: countFindings(findings) },
    findings,
  }
}
