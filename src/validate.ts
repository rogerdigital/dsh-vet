/**
 * Structural validation for `dsh-vet/v1` reports (ROADMAP v0.3).
 *
 * Marketplaces and CI jobs receive reports from scanners they did not write.
 * This module checks a report against the contract without trusting the
 * emitter: every normative statement in `docs/dsh-vet-v1.md` is enforced —
 * field types, enums, rule-id shape, evidence presence, the derived summary,
 * and the deterministic sort order. Unknown fields are ignored (design
 * rule 4). The derived-summary check is the load-bearing one: an emitter
 * cannot assert a flattering grade that its findings do not support.
 *
 * @module dsh-vet/validate
 */

import {
  SCHEMA_ID,
  SEVERITY_RANK,
  RULE_ID_PATTERN,
  countFindings,
  gradeFor,
} from './contract.ts'
import type { VetConfidence, VetGrade, VetSeverity } from './contract.ts'

export interface ValidationIssue {
  /** Dotted path into the report, e.g. `findings[2].evidence[0].line`. */
  path: string
  message: string
}

export interface ValidationResult {
  ok: boolean
  issues: ValidationIssue[]
}

const SEVERITIES: readonly VetSeverity[] = ['critical', 'high', 'medium', 'low', 'info']
const CONFIDENCES: readonly VetConfidence[] = ['high', 'medium', 'low']
const GRADES: readonly VetGrade[] = ['A', 'B', 'C', 'D', 'F', 'X']
const TARGET_KINDS = ['npm-package', 'git-repo', 'local-path'] as const
const RFC3339 = /^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(\.\d+)?([Zz]|[+-]\d{2}:\d{2})$/

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function show(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value)
  if (Array.isArray(value)) return 'an array'
  if (isObject(value)) return 'an object'
  return String(value)
}

function isInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value)
}

/**
 * Validate a parsed report against the `dsh-vet/v1` contract. Collects every
 * issue instead of failing on the first, so an emitter sees its full repair
 * list in one pass.
 */
export function validateReport(report: unknown): ValidationResult {
  const issues: ValidationIssue[] = []
  const fail = (path: string, message: string): void => {
    issues.push({ path, message })
  }
  if (!isObject(report)) {
    return { ok: false, issues: [{ path: 'report', message: `must be an object, got ${show(report)}` }] }
  }

  if (report.schema !== SCHEMA_ID) {
    fail('schema', `must be ${JSON.stringify(SCHEMA_ID)}, got ${show(report.schema)}`)
  }

  if (!isObject(report.target)) {
    fail('target', `must be an object, got ${show(report.target)}`)
  } else {
    const target = report.target
    if (!TARGET_KINDS.includes(target.kind as never)) {
      fail('target.kind', `must be one of ${TARGET_KINDS.map((k) => JSON.stringify(k)).join(' | ')}, got ${show(target.kind)}`)
    }
    if (typeof target.specifier !== 'string') {
      fail('target.specifier', `must be a string, got ${show(target.specifier)}`)
    }
    if (target.resolved !== undefined) {
      if (!isObject(target.resolved)) {
        fail('target.resolved', `must be an object, got ${show(target.resolved)}`)
      } else {
        for (const key of ['version', 'commit', 'integrity'] as const) {
          const value = target.resolved[key]
          if (value !== undefined && typeof value !== 'string') {
            fail(`target.resolved.${key}`, `must be a string, got ${show(value)}`)
          }
        }
      }
    }
  }

  if (!isObject(report.scanner)) {
    fail('scanner', `must be an object, got ${show(report.scanner)}`)
  } else {
    const scanner = report.scanner
    if (typeof scanner.name !== 'string') {
      fail('scanner.name', `must be a string, got ${show(scanner.name)}`)
    }
    if (typeof scanner.version !== 'string') {
      fail('scanner.version', `must be a string, got ${show(scanner.version)}`)
    }
    if (typeof scanner.ranAt !== 'string' || !RFC3339.test(scanner.ranAt) || Number.isNaN(Date.parse(scanner.ranAt))) {
      fail('scanner.ranAt', `must be an RFC 3339 timestamp, got ${show(scanner.ranAt)}`)
    }
  }

  let findingsShapeOk = false
  if (!Array.isArray(report.findings)) {
    fail('findings', `must be an array, got ${show(report.findings)}`)
  } else {
    findingsShapeOk = true
    report.findings.forEach((raw, i) => {
      const at = `findings[${i}]`
      if (!isObject(raw)) {
        fail(at, `must be an object, got ${show(raw)}`)
        findingsShapeOk = false
        return
      }
      const finding = raw
      if (typeof finding.id !== 'string' || !RULE_ID_PATTERN.test(finding.id)) {
        fail(`${at}.id`, `must match ${RULE_ID_PATTERN} (vendor rule sets prefix their own segment, e.g. acme.eval-detect), got ${show(finding.id)}`)
      }
      if (typeof finding.title !== 'string') {
        fail(`${at}.title`, `must be a string, got ${show(finding.title)}`)
      }
      if (!SEVERITIES.includes(finding.severity as never)) {
        fail(`${at}.severity`, `must be one of ${SEVERITIES.map((s) => JSON.stringify(s)).join(' | ')}, got ${show(finding.severity)}`)
        findingsShapeOk = false
      }
      if (!CONFIDENCES.includes(finding.confidence as never)) {
        fail(`${at}.confidence`, `must be one of ${CONFIDENCES.map((c) => JSON.stringify(c)).join(' | ')}, got ${show(finding.confidence)}`)
        findingsShapeOk = false
      }
      if (!Array.isArray(finding.evidence) || finding.evidence.length === 0) {
        fail(`${at}.evidence`, 'must be a non-empty array')
      } else {
        finding.evidence.forEach((ev, j) => {
          const evAt = `${at}.evidence[${j}]`
          if (!isObject(ev)) {
            fail(evAt, `must be an object, got ${show(ev)}`)
            return
          }
          if (typeof ev.file !== 'string') {
            fail(`${evAt}.file`, `must be a string, got ${show(ev.file)}`)
          }
          if (ev.line !== undefined && (!isInt(ev.line) || ev.line < 1)) {
            fail(`${evAt}.line`, `must be a positive integer, got ${show(ev.line)}`)
          }
          if (ev.snippet !== undefined && typeof ev.snippet !== 'string') {
            fail(`${evAt}.snippet`, `must be a string, got ${show(ev.snippet)}`)
          }
          if (ev.note !== undefined && typeof ev.note !== 'string') {
            fail(`${evAt}.note`, `must be a string, got ${show(ev.note)}`)
          }
        })
      }
      if (finding.remediation !== undefined && typeof finding.remediation !== 'string') {
        fail(`${at}.remediation`, `must be a string, got ${show(finding.remediation)}`)
      }
      if (finding.references !== undefined) {
        if (!Array.isArray(finding.references) || finding.references.some((ref) => typeof ref !== 'string')) {
          fail(`${at}.references`, `must be an array of strings, got ${show(finding.references)}`)
        }
      }
    })
  }

  if (!isObject(report.summary)) {
    fail('summary', `must be an object, got ${show(report.summary)}`)
  } else {
    const summary = report.summary
    if (!GRADES.includes(summary.grade as never)) {
      fail('summary.grade', `must be one of ${GRADES.join(' | ')}, got ${show(summary.grade)}`)
    }
    if (!isObject(summary.counts)) {
      fail('summary.counts', `must be an object, got ${show(summary.counts)}`)
    } else {
      for (const severity of SEVERITIES) {
        const count = summary.counts[severity]
        if (!isInt(count) || count < 0) {
          fail(`summary.counts.${severity}`, `must be a non-negative integer, got ${show(count)}`)
        }
      }
    }
  }

  // Derived-summary and sort checks only run over findings that passed the
  // enum checks; gradeFor/countFindings assume valid severities.
  if (findingsShapeOk && Array.isArray(report.findings) && isObject(report.summary) && isObject(report.summary.counts)) {
    const findings = report.findings as never as Parameters<typeof countFindings>[0]
    const derivedCounts = countFindings(findings)
    for (const severity of SEVERITIES) {
      if (report.summary.counts[severity] !== derivedCounts[severity]) {
        fail(`summary.counts.${severity}`, `must match the findings (${report.summary.counts[severity]} asserted, ${derivedCounts[severity]} derived) — the summary is always derived, never asserted`)
      }
    }
    const grade = report.summary.grade
    if (grade !== 'X') {
      const derivedGrade = gradeFor(findings)
      if (grade !== derivedGrade) {
        fail('summary.grade', `${show(grade)} is asserted but the findings derive ${JSON.stringify(derivedGrade)} — the summary is always derived, never asserted`)
      }
    }
    for (let i = 1; i < report.findings.length; i++) {
      const prev = report.findings[i - 1] as Record<string, unknown>
      const cur = report.findings[i] as Record<string, unknown>
      const prevRank = SEVERITY_RANK[prev.severity as VetSeverity]
      const curRank = SEVERITY_RANK[cur.severity as VetSeverity]
      if (prevRank > curRank || (prevRank === curRank && String(prev.id).localeCompare(String(cur.id)) > 0)) {
        fail('findings', `must be sorted worst severity first then id ascending; ${show(cur.id)} follows ${show(prev.id)}`)
        break
      }
    }
  }

  return { ok: issues.length === 0, issues }
}
