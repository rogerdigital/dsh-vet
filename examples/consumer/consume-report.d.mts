/** Types for the consumer example (hand-written .mjs, no build). */

export interface ConsumerApi {
  validateReport(report: unknown): { ok: boolean; issues: ReadonlyArray<{ path: string; message: string }> }
  coverageOf(report: unknown): string
  renderMarkdown(report: unknown, options: { runUrl: string }): string
}

export interface AssessResult {
  valid: boolean
  issues: ReadonlyArray<{ path: string; message: string }>
  coverage: string
  applicability: string
  markdown: string | null
}

export declare const APPLICABILITY_UNSUPPORTED: string

export declare function assess(report: unknown, api: ConsumerApi, options?: { runUrl?: string }): AssessResult
