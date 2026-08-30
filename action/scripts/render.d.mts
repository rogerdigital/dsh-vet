/** Types for the action's pure render layer (hand-written .mjs, no build). */

export interface BadgeReportInput {
  summary: { grade: string }
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
}

export function renderBadgeJson(report: BadgeReportInput): {
  schemaVersion: number
  label: string
  message: string
  color: string
  isError?: boolean
}

export function renderCommentMarkdown(report: CommentReportInput, opts: { runUrl: string }): string
