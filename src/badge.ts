/**
 * Shields.io endpoint badge from a dsh-vet/v1 report (ROADMAP v0.2, D3).
 *
 * The badge never talks to a service of ours: it is a static JSON file
 * generated from the committed report, fetched by shields.io from the
 * repository. Its value is auditable through git history — `report.json` in,
 * badge out, nothing in between.
 */

import type { VetGrade, VetReport } from './contract.ts'
import { coverageOf } from './scan-context.ts'

export interface ShieldsEndpointBadge {
  schemaVersion: 1
  label: string
  message: string
  color: string
  isError?: boolean
}

const GRADE_COLOR: Record<VetGrade, string> = {
  A: 'brightgreen',
  B: 'green',
  C: 'yellow',
  D: 'orange',
  F: 'red',
  X: 'lightgrey',
}

export function renderBadge(report: VetReport): ShieldsEndpointBadge {
  const grade = report.summary.grade
  const coverage = coverageOf(report)
  // A partial or unknown-coverage scan never presents an unqualified pass.
  const qualifier =
    grade === 'X'
      ? ''
      : coverage === 'partial'
        ? ' (partial)'
        : coverage === 'unknown'
          ? ' (coverage unknown)'
          : ''
  return {
    schemaVersion: 1,
    label: 'dsh-vet',
    message: grade === 'X' ? 'scan failed' : `grade ${grade}${qualifier}`,
    color: GRADE_COLOR[grade],
    ...(grade === 'X' ? { isError: true } : {}),
  }
}
