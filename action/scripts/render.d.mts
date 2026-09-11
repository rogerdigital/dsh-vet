/** Types for the action's pure render layer (hand-written .mjs, no build). */

export interface ScanContextLike {
  coverage?: { status?: string }
}

export interface BadgeReportInput {
  summary: { grade: string }
  'x-dsh-vet'?: ScanContextLike
}

export interface CommentReportInput {
  summary: {
    grade: string
    counts: { critical: number; high: number; medium: number; low: number; info: number }
  }
  target: { specifier: string }
  findings: ReadonlyArray<{
    id: string
    title: string
    severity: string
    confidence: string
    evidence: ReadonlyArray<{ file: string; line?: number; snippet?: string }>
  }>
  'x-dsh-vet'?: ScanContextLike
}

export interface DiffResultInput {
  comparability: 'comparable' | 'incomparable'
  reasons?: readonly string[]
  base: { grade: string }
  head: { grade: string }
  findings?: {
    added?: ReadonlyArray<{ rule: string; file: string; subject: string }>
    removed?: ReadonlyArray<{ rule: string; file: string; subject: string }>
    changed?: ReadonlyArray<unknown>
  }
  observations?: {
    added?: ReadonlyArray<unknown>
  }
}

export function renderBadgeJson(report: BadgeReportInput): {
  schemaVersion: number
  label: string
  message: string
  color: string
  isError?: boolean
}

export function renderCommentMarkdown(report: CommentReportInput, opts: { runUrl: string }): string

export function escapeMarkdown(text: string): string

export function renderComparisonMarkdown(diff: DiffResultInput, opts: { runUrl: string }): string

export function renderComparisonUnavailableMarkdown(reason: string): string
