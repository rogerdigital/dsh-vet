/**
 * Pure report comparison (`dsh-vet/diff/v1`). See `docs/report-diff-v1.md`
 * for the normative spec.
 *
 * The comparator never fetches packages, never mutates either report, and
 * never recalculates a report under new rules. It compares what two
 * validated reports actually recorded, and when the two cannot be trusted
 * to describe the same subject under the same checks, it says
 * `incomparable` with explicit reasons instead of producing a diff that
 * would read as a risk-reduction claim.
 *
 * @module dsh-vet/compare
 */

import type {
  FindingIdentityV1,
  ScanContextV1,
  ScanObservationV1,
} from './scan-context.ts'
import { checkScanContext } from './scan-context.ts'
import type { VetConfidence, VetGrade, VetReport, VetScanner, VetSeverity } from './contract.ts'
import { validateReport } from './validate.ts'

/** Literal `schema` value every dsh-vet/diff/v1 result carries. */
export const DIFF_SCHEMA_ID = 'dsh-vet/diff/v1' as const

export interface CompareOptions {
  /**
   * Explicit shared subject label, required to compare two local-directory
   * scans that carry no package identity. Identity is never inferred from
   * temporary absolute paths.
   */
  subjectLabel?: string
}

/** Machine-readable reasons a pair cannot be compared. */
export type DiffReason =
  | 'report-invalid-base'
  | 'report-invalid-head'
  | 'context-absent-base'
  | 'context-absent-head'
  | 'context-unsupported-base'
  | 'context-unsupported-head'
  | 'context-invalid-base'
  | 'context-invalid-head'
  | 'identities-absent-base'
  | 'identities-absent-head'
  | 'scanner-mismatch'
  | 'profile-mismatch'
  | 'subject-mismatch'
  | 'subject-unlabeled'
  | 'grade-x-base'
  | 'grade-x-head'
  | 'coverage-partial-base'
  | 'coverage-partial-head'

/** Subject reference for one side of a comparison. */
export interface DiffSubjectRef {
  subjectLabel?: string
  packageName?: string
  analysisInputDigest: string
  archiveDigest?: string
}

/** Report-level reference for one side: who scanned, what grade, what subject. */
export interface DiffSide {
  scanner: { name: string; version: string; ranAt: string }
  grade: VetGrade
  subject: DiffSubjectRef
}

/** A matched identity whose finding properties or counts moved. */
export interface FindingTransition {
  identity: { rule: string; variant: string; file: string; subject: string }
  count: { base: number; head: number }
  severity: { base: VetSeverity; head: VetSeverity }
  confidence: { base: VetConfidence; head: VetConfidence }
}

/** A matched observation whose count moved. */
export interface ObservationTransition {
  base: ScanObservationV1
  head: ScanObservationV1
}

export interface VetDiff {
  readonly schema: typeof DIFF_SCHEMA_ID
  readonly base: DiffSide
  readonly head: DiffSide
  readonly comparability: 'comparable' | 'incomparable'
  readonly reasons: readonly DiffReason[]
  readonly findings: {
    /** Identities present only in head — newly observed risk. */
    readonly added: readonly FindingIdentityV1[]
    /** Identities present only in base — no longer observed under comparable checks, not proven fixed. */
    readonly removed: readonly FindingIdentityV1[]
    /** Matched identities whose severity, confidence, or count changed; both sides recorded. */
    readonly changed: readonly FindingTransition[]
    readonly unchanged: readonly FindingIdentityV1[]
  }
  readonly observations: {
    readonly added: readonly ScanObservationV1[]
    readonly removed: readonly ScanObservationV1[]
    readonly countChanged: readonly ObservationTransition[]
    readonly unchanged: readonly ScanObservationV1[]
  }
}

const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

const identityKey = (i: FindingIdentityV1): string => `${i.rule}\0${i.variant}\0${i.file}\0${i.subject}`
const observationKey = (o: ScanObservationV1): string => `${o.kind}\0${o.file}\0${o.subject}`
const sortIdentity = (a: FindingIdentityV1, b: FindingIdentityV1): number =>
  compareText(a.rule, b.rule) || compareText(a.variant, b.variant) || compareText(a.file, b.file) || compareText(a.subject, b.subject)
const sortObservation = (a: ScanObservationV1, b: ScanObservationV1): number =>
  compareText(a.kind, b.kind) || compareText(a.file, b.file) || compareText(a.subject, b.subject)

const countOf = (entry: { count?: number }): number => entry.count ?? 1

interface Side {
  report: VetReport
  context: ScanContextV1
}

function sideRef(side: Side, subjectLabel: string | undefined): DiffSide {
  return {
    scanner: {
      name: side.report.scanner.name,
      version: side.report.scanner.version,
      ranAt: side.report.scanner.ranAt,
    },
    grade: side.report.summary.grade,
    subject: {
      ...(subjectLabel !== undefined ? { subjectLabel } : {}),
      ...(side.context.subject.packageName !== undefined
        ? { packageName: side.context.subject.packageName }
        : {}),
      analysisInputDigest: side.context.subject.analysisInputDigest,
      ...(side.context.subject.archiveDigest !== undefined
        ? { archiveDigest: side.context.subject.archiveDigest }
        : {}),
    },
  }
}

function emptyDiff(base: DiffSide, head: DiffSide, reasons: DiffReason[]): VetDiff {
  return {
    schema: DIFF_SCHEMA_ID,
    base,
    head,
    comparability: 'incomparable',
    reasons,
    findings: { added: [], removed: [], changed: [], unchanged: [] },
    observations: { added: [], removed: [], countChanged: [], unchanged: [] },
  }
}

/** Best-effort reference for a report that failed validation; reasons carry the story. */
function fallbackRef(value: unknown): DiffSide {
  const report = (typeof value === 'object' && value !== null ? value : {}) as Partial<VetReport> & {
    'x-dsh-vet'?: { subject?: Partial<ScanContextV1['subject']> }
  }
  const scanner = (report.scanner ?? {}) as Partial<VetScanner>
  const subject = report['x-dsh-vet']?.subject
  return {
    scanner: { name: scanner.name ?? '', version: scanner.version ?? '', ranAt: scanner.ranAt ?? '' },
    grade: report.summary?.grade ?? 'X',
    subject: {
      ...(subject?.packageName !== undefined ? { packageName: subject.packageName } : {}),
      analysisInputDigest: subject?.analysisInputDigest ?? '',
      ...(subject?.archiveDigest !== undefined ? { archiveDigest: subject.archiveDigest } : {}),
    },
  }
}

/**
 * Compare two `dsh-vet/v1` reports as pure data. Deterministic: every
 * output collection is sorted and stable. Inputs are never mutated.
 */
export function compareReports(base: unknown, head: unknown, options: CompareOptions = {}): VetDiff {
  const baseValidation = validateReport(base)
  const headValidation = validateReport(head)
  if (!baseValidation.ok || !headValidation.ok) {
    const reasons: DiffReason[] = []
    // A report whose only issues live under x-dsh-vet has an invalid
    // extension context, not a broken base report — different repair path.
    if (!baseValidation.ok) {
      reasons.push(baseValidation.issues.every((issue) => issue.path.startsWith('x-dsh-vet')) ? 'context-invalid-base' : 'report-invalid-base')
    }
    if (!headValidation.ok) {
      reasons.push(headValidation.issues.every((issue) => issue.path.startsWith('x-dsh-vet')) ? 'context-invalid-head' : 'report-invalid-head')
    }
    return emptyDiff(fallbackRef(base), fallbackRef(head), reasons)
  }
  const baseReport = base as VetReport
  const headReport = head as VetReport

  const baseCheck = checkScanContext(baseReport)
  const headCheck = checkScanContext(headReport)
  const reasons: DiffReason[] = []
  if (baseCheck.state === 'absent') reasons.push('context-absent-base')
  if (headCheck.state === 'absent') reasons.push('context-absent-head')
  if (baseCheck.state === 'unsupported') reasons.push('context-unsupported-base')
  if (headCheck.state === 'unsupported') reasons.push('context-unsupported-head')
  if (baseCheck.state === 'invalid') reasons.push('context-invalid-base')
  if (headCheck.state === 'invalid') reasons.push('context-invalid-head')
  if (reasons.length > 0) {
    return emptyDiff(fallbackRef(baseReport), fallbackRef(headReport), reasons)
  }

  const baseContext = (baseCheck as { context: ScanContextV1 }).context
  const headContext = (headCheck as { context: ScanContextV1 }).context

  if (baseContext.findingIdentities === undefined) reasons.push('identities-absent-base')
  if (headContext.findingIdentities === undefined) reasons.push('identities-absent-head')
  if (baseReport.scanner.name !== headReport.scanner.name || baseReport.scanner.version !== headReport.scanner.version) {
    reasons.push('scanner-mismatch')
  }
  if (baseContext.profile.digest !== headContext.profile.digest) reasons.push('profile-mismatch')

  const baseName = baseContext.subject.packageName
  const headName = headContext.subject.packageName
  if (baseName !== undefined && headName !== undefined) {
    if (baseName !== headName) reasons.push('subject-mismatch')
  } else if (baseName !== undefined || headName !== undefined) {
    reasons.push('subject-mismatch')
  } else if (options.subjectLabel === undefined) {
    // Two local-directory scans with no package identity: never infer
    // identity from temporary absolute paths.
    reasons.push('subject-unlabeled')
  }
  if (baseReport.summary.grade === 'X') reasons.push('grade-x-base')
  if (headReport.summary.grade === 'X') reasons.push('grade-x-head')
  if (baseContext.coverage.status !== 'complete') reasons.push('coverage-partial-base')
  if (headContext.coverage.status !== 'complete') reasons.push('coverage-partial-head')
  if (reasons.length > 0) {
    return emptyDiff(
      sideRef({ report: baseReport, context: baseContext }, options.subjectLabel),
      sideRef({ report: headReport, context: headContext }, options.subjectLabel),
      reasons,
    )
  }

  const baseSide: Side = { report: baseReport, context: baseContext }
  const headSide: Side = { report: headReport, context: headContext }

  const baseIdentities = baseContext.findingIdentities!
  const headIdentities = headContext.findingIdentities!
  const baseByIdentity = new Map(baseIdentities.map((i) => [identityKey(i), i]))
  const headByIdentity = new Map(headIdentities.map((i) => [identityKey(i), i]))

  const added: FindingIdentityV1[] = []
  const removed: FindingIdentityV1[] = []
  const changed: FindingTransition[] = []
  const unchanged: FindingIdentityV1[] = []

  for (const identity of headIdentities) {
    const match = baseByIdentity.get(identityKey(identity))
    if (!match) {
      added.push(identity)
      continue
    }
    const baseFinding = baseSide.report.findings[match.finding]!
    const headFinding = headSide.report.findings[identity.finding]!
    const countBase = countOf(match)
    const countHead = countOf(identity)
    if (
      baseFinding.severity !== headFinding.severity ||
      baseFinding.confidence !== headFinding.confidence ||
      countBase !== countHead
    ) {
      changed.push({
        identity: {
          rule: identity.rule,
          variant: identity.variant,
          file: identity.file,
          subject: identity.subject,
        },
        count: { base: countBase, head: countHead },
        severity: { base: baseFinding.severity, head: headFinding.severity },
        confidence: { base: baseFinding.confidence, head: headFinding.confidence },
      })
    } else {
      unchanged.push(identity)
    }
  }
  for (const identity of baseIdentities) {
    if (!headByIdentity.has(identityKey(identity))) removed.push(identity)
  }

  const baseObservations = baseContext.observations
  const headObservations = headContext.observations
  const baseByObservation = new Map(baseObservations.map((o) => [observationKey(o), o]))
  const headByObservation = new Map(headObservations.map((o) => [observationKey(o), o]))
  const obsAdded: ScanObservationV1[] = []
  const obsRemoved: ScanObservationV1[] = []
  const obsCountChanged: ObservationTransition[] = []
  const obsUnchanged: ScanObservationV1[] = []
  for (const observation of headObservations) {
    const match = baseByObservation.get(observationKey(observation))
    if (!match) {
      obsAdded.push(observation)
    } else if (countOf(match) !== countOf(observation)) {
      obsCountChanged.push({ base: match, head: observation })
    } else {
      obsUnchanged.push(observation)
    }
  }
  for (const observation of baseObservations) {
    if (!headByObservation.has(observationKey(observation))) obsRemoved.push(observation)
  }

  return {
    schema: DIFF_SCHEMA_ID,
    base: sideRef(baseSide, options.subjectLabel),
    head: sideRef(headSide, options.subjectLabel),
    comparability: 'comparable',
    reasons: [],
    findings: {
      added: added.sort(sortIdentity),
      removed: removed.sort(sortIdentity),
      changed: changed.sort((a, b) =>
        compareText(
          `${a.identity.rule}\0${a.identity.variant}\0${a.identity.file}\0${a.identity.subject}`,
          `${b.identity.rule}\0${b.identity.variant}\0${b.identity.file}\0${b.identity.subject}`,
        ),
      ),
      unchanged,
    },
    observations: {
      added: obsAdded.sort(sortObservation),
      removed: obsRemoved.sort(sortObservation),
      countChanged: obsCountChanged.sort((a, b) => compareText(observationKey(a.head), observationKey(b.head))),
      unchanged: obsUnchanged,
    },
  }
}
