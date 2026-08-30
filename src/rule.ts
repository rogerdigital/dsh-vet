/**
 * Rule module contract (ROADMAP T3): every shipped rule is a small object with
 * a public id, conservative defaults, and a pure `check` over the analysis.
 * Findings inherit the rule's severity/confidence unless the check overrides —
 * uncertain evidence must lower severity or confidence, never raise it.
 */

import type { Analysis, CapabilityUse } from './analyze.ts'
import type { VetConfidence, VetEvidence, VetFinding, VetSeverity } from './contract.ts'

export interface RuleContext {
  analysis: Analysis
}

export interface Rule {
  /** Namespaced id matching RULE_ID_PATTERN, e.g. `perm.subprocess-spawn`. */
  id: string
  /** One-line human title. */
  title: string
  defaultSeverity: VetSeverity
  defaultConfidence: VetConfidence
  check(ctx: RuleContext): VetFinding[]
}

export interface FindingInit {
  title?: string
  severity?: VetSeverity
  confidence?: VetConfidence
  evidence: VetEvidence[]
  remediation?: string
  references?: string[]
}

/** Build a finding from a rule, applying its defaults. */
export function finding(rule: Rule, init: FindingInit): VetFinding {
  return {
    id: rule.id,
    title: init.title ?? rule.title,
    severity: init.severity ?? rule.defaultSeverity,
    confidence: init.confidence ?? rule.defaultConfidence,
    evidence: init.evidence,
    remediation: init.remediation,
    references: init.references,
  }
}

/** Evidence list capped at `max`, with a trailing note counting the rest. */
export function capEvidence(evidence: VetEvidence[], max = 10): VetEvidence[] {
  if (evidence.length <= max) return evidence
  return [...evidence.slice(0, max), { file: '.', note: `…and ${evidence.length - max} more` }]
}

export function usesOfCap(analysis: Analysis, cap: string): CapabilityUse[] {
  return analysis.capUses.filter((use) => use.cap === cap)
}

export function hasCap(analysis: Analysis, cap: string): boolean {
  return analysis.capUses.some((use) => use.cap === cap)
}

/** Case-insensitive seam membership; null means "no declaration made". */
export function declaresSeam(analysis: Analysis, seam: string): boolean | null {
  if (!analysis.pkg?.seams) return null
  return analysis.pkg.seams.some((s) => s.toLowerCase() === seam.toLowerCase())
}

/** Bounded Levenshtein distance: returns `max + 1` once exceeded. */
export function editDistance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  const prev = new Array<number>(b.length + 1)
  const curr = new Array<number>(b.length + 1)
  for (let j = 0; j <= b.length; j += 1) prev[j] = j
  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i
    let rowMin = curr[0]!
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(prev[j]! + 1, curr[j - 1]! + 1, prev[j - 1]! + cost)
      if (curr[j]! < rowMin) rowMin = curr[j]!
    }
    if (rowMin > max) return max + 1
    for (let j = 0; j <= b.length; j += 1) prev[j] = curr[j]!
  }
  return prev[b.length]!
}
