/**
 * Rule registry. Order is by id for stable execution; `createReport` sorts
 * findings afterwards regardless, but deterministic input keeps debugging
 * honest.
 */

import type { Analysis } from '../analyze.ts'
import type { Rule } from '../rule.ts'
import type { VetFinding } from '../contract.ts'
import { depRules } from './dep.ts'
import { egressRules } from './egress.ts'
import { obfRules } from './obf.ts'
import { permRules } from './perm.ts'

export const RULES: Rule[] = [...depRules, ...egressRules, ...obfRules, ...permRules].sort((a, b) =>
  a.id.localeCompare(b.id),
)

export function ruleIds(): string[] {
  return RULES.map((rule) => rule.id)
}

/** Run all rules, or the subset named in `only` (unknown ids throw). */
export function runRules(analysis: Analysis, only?: string[]): VetFinding[] {
  let selected = RULES
  if (only && only.length > 0) {
    const known = new Set(RULES.map((r) => r.id))
    const unknown = only.filter((id) => !known.has(id))
    if (unknown.length > 0) {
      throw new Error(`unknown rule id(s): ${unknown.join(', ')}`)
    }
    selected = RULES.filter((rule) => only.includes(rule.id))
  }
  const findings: VetFinding[] = []
  for (const rule of selected) {
    findings.push(...rule.check({ analysis }))
  }
  return findings
}
