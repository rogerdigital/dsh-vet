/**
 * Human rendering of a `dsh-vet/diff/v1` result for the CLI. Pure — diff
 * in, text out. The summary leads with comparability, both subjects, and
 * added behavior; the grade appears only as secondary context. Detail
 * lists are bounded and every truncation is disclosed.
 *
 * `action/scripts/render.mjs` will carry the markdown counterpart for PR
 * comments; this module owns the terminal form.
 *
 * @module dsh-vet/render-diff
 */

import type { DiffSide, VetDiff } from './compare.ts'

const LIMIT = 10

/**
 * Stated on every diff output, per pilot feedback: what the comparison
 * covers is package-level static behavior — composed-profile and
 * host-version behavior is invisible from the package alone.
 */
const SCOPE_NOTE =
  'scope: package-level static behavior only — behavior that depends on the composed DSH profile or host version is not visible from the package alone.'

/** Strip control characters — report-derived text goes to a terminal. */
function sanitize(text: string): string {
  return text.replace(/[\u0000-\u001f\u007f]/g, '')
}

function digestPrefix(digest: string): string {
  return digest.length > 16 ? `${digest.slice(0, 16)}…` : digest
}

function subjectOf(side: DiffSide): string {
  return sanitize(side.subject.subjectLabel ?? side.subject.packageName ?? 'unlabeled subject')
}

function sideLine(side: DiffSide): string {
  return `${sanitize(side.scanner.name)} ${sanitize(side.scanner.version)} · grade ${side.grade} · ${subjectOf(side)} · ${digestPrefix(side.subject.analysisInputDigest)}`
}

function renderDiffText(diff: VetDiff): string {
  const lines: string[] = []
  lines.push(`dsh-vet diff · ${diff.comparability}`)
  if (diff.reasons.length > 0) lines.push(`reasons: ${diff.reasons.join(', ')}`)
  lines.push(`base: ${sideLine(diff.base)}`)
  lines.push(`head: ${sideLine(diff.head)}`)

  if (diff.comparability === 'incomparable') {
    lines.push('comparison unavailable — when practical, rescan both artifacts with the same scanner and profile.')
    lines.push(SCOPE_NOTE)
    return lines.join('\n')
  }

  const section = (title: string, entries: string[], total: number): void => {
    if (total === 0) return
    lines.push(`${title} (${total}):`)
    for (const entry of entries) lines.push(entry)
    if (total > entries.length) {
      lines.push(`  …and ${total - entries.length} more — truncated; rerun with --json for the full result`)
    }
  }

  section(
    'added findings',
    diff.findings.added
      .slice(0, LIMIT)
      .map((i) => `  + ${sanitize(i.rule)} · ${sanitize(i.variant)} · ${sanitize(i.file)} · ${sanitize(i.subject)}`),
    diff.findings.added.length,
  )
  section(
    'added observations',
    diff.observations.added
      .slice(0, LIMIT)
      .map((o) => `  + ${sanitize(o.kind)} · ${sanitize(o.file)} · ${sanitize(o.subject)}`),
    diff.observations.added.length,
  )
  section(
    'removed findings',
    diff.findings.removed
      .slice(0, LIMIT)
      .map((i) => `  - ${sanitize(i.rule)} · ${sanitize(i.variant)} · ${sanitize(i.file)} · ${sanitize(i.subject)} (no longer observed, not proven fixed)`),
    diff.findings.removed.length,
  )
  section(
    'removed observations',
    diff.observations.removed
      .slice(0, LIMIT)
      .map((o) => `  - ${sanitize(o.kind)} · ${sanitize(o.file)} · ${sanitize(o.subject)}`),
    diff.observations.removed.length,
  )
  section(
    'changed findings',
    diff.findings.changed
      .slice(0, LIMIT)
      .map(
        (t) =>
          `  ~ ${sanitize(t.identity.rule)} · ${sanitize(t.identity.variant)} · ${sanitize(t.identity.file)} · ${sanitize(t.identity.subject)} · severity ${t.severity.base} → ${t.severity.head} · confidence ${t.confidence.base} → ${t.confidence.head} · count ${t.count.base} → ${t.count.head}`,
      ),
    diff.findings.changed.length,
  )
  section(
    'changed observation counts',
    diff.observations.countChanged
      .slice(0, LIMIT)
      .map((t) => `  ~ ${sanitize(t.head.kind)} · ${sanitize(t.head.file)} · ${sanitize(t.head.subject)} · count ${t.base.count ?? 1} → ${t.head.count ?? 1}`),
    diff.observations.countChanged.length,
  )

  lines.push(
    `summary: ${diff.findings.added.length} added · ${diff.findings.removed.length} removed · ${diff.findings.changed.length} changed · ${diff.findings.unchanged.length} unchanged`,
  )
  lines.push(`grade: ${diff.base.grade} → ${diff.head.grade} (secondary context)`)
  lines.push(SCOPE_NOTE)
  return lines.join('\n')
}

export { renderDiffText }
