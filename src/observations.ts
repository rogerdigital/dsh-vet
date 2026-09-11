/**
 * Stable risk observations and finding identities, derived from the same
 * analysis facts the rules consumed — never a second parse of the sources.
 * See `docs/scan-context-v1.md` (observations area) for the semantics.
 *
 * Identity rules that keep comparisons honest:
 * - Observation identity is `kind + file + subject`; finding identity is
 *   `rule + variant + file + subject`. Line numbers, display titles,
 *   severity, confidence, and code formatting are excluded.
 * - Hosts are normalized: no credentials, no query strings, no
 *   secret-bearing URL paths; the port stays explicit.
 * - Duplicate identical subjects are counts, never repeated entries.
 * - Secret values are never emitted: content that must match across
 *   reports is identified by SHA-256, not by value.
 *
 * @module dsh-vet/observations
 */

import type { Analysis } from './analyze.ts'
import type { VetFinding } from './contract.ts'
import type { Rule } from './rule.ts'
import type { FindingIdentityV1, ScanObservationV1 } from './scan-context.ts'
import { sha256Hex } from './scan-context.ts'

const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/**
 * Normalize a literal that may carry a host into a host identity: URL
 * `host` (port kept, userinfo and query dropped) when it parses, else the
 * leading path-free segment with any userinfo stripped. Null when nothing
 * host-like remains.
 */
export function normalizeHost(literal: string): string | null {
  try {
    const url = new URL(literal)
    if (url.host) return url.host
  } catch {
    // not a full URL — fall through to the bare form
  }
  const bare = literal.split(/[/?#]/)[0]!.replace(/^[^/@]*@/, '')
  return bare === '' ? null : bare
}

/** Hosts observed as literal call arguments, normalized, per file. */
function literalHostsOf(literals: readonly string[]): string[] {
  const hosts: string[] = []
  for (const literal of literals) {
    const host = normalizeHost(literal)
    if (host) hosts.push(host)
  }
  return hosts
}

const LIFECYCLE_SCRIPTS = ['install', 'postinstall', 'preinstall'] as const
const SECRET_READ_CAPS = new Set(['env', 'homedir', 'secret-read'])

/**
 * Behavior facts supported by the existing analysis: capabilities, literal
 * outbound hosts, install lifecycle scripts, and identified sensitive
 * reads. Sorted by kind, file, subject with duplicate counts.
 */
export function deriveObservations(analysis: Analysis): ScanObservationV1[] {
  const counts = new Map<string, ScanObservationV1 & { n: number }>()
  const add = (kind: string, file: string, subject: string): void => {
    const key = `${kind}\0${file}\0${subject}`
    const existing = counts.get(key)
    if (existing) existing.n += 1
    else counts.set(key, { kind, file, subject, n: 1 })
  }

  for (const use of analysis.capUses) add('capability', use.file, use.cap)
  for (const use of analysis.netUses) {
    for (const host of literalHostsOf(use.literals)) add('outbound-host', use.file, host)
  }
  const scripts = analysis.pkg?.scripts ?? {}
  for (const name of LIFECYCLE_SCRIPTS) {
    if (typeof scripts[name] === 'string' && scripts[name] !== '') add('install-script', 'package.json', name)
  }
  for (const use of analysis.capUses) {
    if (use.cap !== 'secret-read') continue
    // The identified read target is a path identifier, not a secret value.
    for (const literal of use.literals) add('sensitive-read', use.file, literal)
    if (use.literals.length === 0) add('sensitive-read', use.file, use.api)
  }

  return [...counts.values()]
    .map(({ n, ...observation }) => (n > 1 ? { ...observation, count: n } : observation))
    .sort(
      (a, b) =>
        compareText(a.kind, b.kind) || compareText(a.file, b.file) || compareText(a.subject, b.subject),
    )
}

interface IdentityRule {
  rule: Rule
  variants: readonly string[]
}

/**
 * Stable identities for the emitted findings. Each rule's `subjects`
 * mirrors its `check` predicates, so a variant has subjects exactly when
 * its finding exists; the two stay alignable by the rule's declared
 * variant order. Rules without `subjects`, or whose counts disagree with
 * the emitted findings, contribute no identities — an honest absence, not
 * a guessed match.
 */
export function deriveFindingIdentities(
  analysis: Analysis,
  findings: readonly VetFinding[],
  rules: readonly Rule[],
  options: { emptyAuditRan: boolean },
): FindingIdentityV1[] {
  const counts = new Map<string, FindingIdentityV1 & { n: number }>()
  const add = (rule: string, variant: string, file: string, subject: string, finding: number): void => {
    const key = `${rule}\0${variant}\0${file}\0${subject}`
    const existing = counts.get(key)
    if (existing) existing.n += 1
    else counts.set(key, { rule, variant, file, subject, finding, n: 1 })
  }

  const byId = new Map<string, IdentityRule>()
  for (const rule of rules) {
    if (rule.subjects) byId.set(rule.id, { rule, variants: rule.variants ?? ['default'] })
  }

  const ruleFindingIndexes = new Map<string, number[]>()
  findings.forEach((finding, index) => {
    const list = ruleFindingIndexes.get(finding.id) ?? []
    list.push(index)
    ruleFindingIndexes.set(finding.id, list)
  })

  for (const [id, { rule, variants }] of byId) {
    const subjects = rule.subjects!({ analysis })
    const indexes = ruleFindingIndexes.get(id) ?? []
    const present = variants.filter((variant) => subjects.some((s) => s.variant === variant))
    // Defensive alignment: every finding must map to a variant and vice
    // versa, or the pair is untrustworthy and contributes nothing.
    if (indexes.length !== present.length) continue
    present.forEach((variant, i) => {
      for (const subject of subjects.filter((s) => s.variant === variant)) {
        add(id, variant, subject.file, subject.subject, indexes[i]!)
      }
    })
  }

  if (options.emptyAuditRan) {
    const index = findings.findIndex((finding) => finding.id === 'scan.empty-audit')
    if (index >= 0) add('scan.empty-audit', 'audit', '.', 'no-analyzable-javascript', index)
  }

  return [...counts.values()]
    .map(({ n, ...identity }) => (n > 1 ? { ...identity, count: n } : identity))
    .sort(
      (a, b) =>
        compareText(a.rule, b.rule) ||
        compareText(a.variant, b.variant) ||
        compareText(a.file, b.file) ||
        compareText(a.subject, b.subject),
    )
}

/** Content hash for identity subjects that must match without leaking values. */
export function subjectHash(value: string): string {
  return `sha256:${sha256Hex(value)}`
}
