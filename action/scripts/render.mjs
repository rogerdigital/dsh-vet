// Pure rendering for dsh-vet CI output: PR-comment markdown and the shields
// badge JSON. No side effects, no deps — importable from tests.
// Kept byte-identical to src/render.ts output by test/render.test.ts.

const GRADE_COLOR = {
  A: 'brightgreen', B: 'green', C: 'yellow', D: 'orange', F: 'red', X: 'lightgrey',
}

function coverageOf(report) {
  const context = report['x-dsh-vet']
  if (
    context &&
    typeof context === 'object' &&
    context.version === 1 &&
    context.coverage &&
    typeof context.coverage.status === 'string' &&
    ['complete', 'partial', 'unknown'].includes(context.coverage.status)
  ) {
    return context.coverage.status
  }
  return 'unknown'
}

export function renderBadgeJson(report) {
  const grade = report.summary.grade
  const coverage = coverageOf(report)
  const qualifier = grade === 'X' ? '' : coverage === 'partial' ? ' (partial)' : coverage === 'unknown' ? ' (coverage unknown)' : ''
  return {
    schemaVersion: 1,
    label: 'dsh-vet',
    message: grade === 'X' ? 'scan failed' : `grade ${grade}${qualifier}`,
    color: GRADE_COLOR[grade] ?? 'lightgrey',
    ...(grade === 'X' ? { isError: true } : {}),
  }
}

export function renderCommentMarkdown(report, { runUrl }) {
  const c = report.summary.counts
  const lines = [
    '<!-- dsh-vet:pr-comment -->',
    '## dsh-vet report',
    '',
    `**Grade: ${report.summary.grade}** · coverage: ${coverageOf(report)} · audited \`${report.target.specifier}\` · [run](${runUrl}) · report uploaded as the \`dsh-vet-report\` artifact`,
    '',
    `| critical | high | medium | low | info |`,
    `| --- | --- | --- | --- | --- |`,
    `| ${c.critical} | ${c.high} | ${c.medium} | ${c.low} | ${c.info} |`,
    '',
  ]
  const graded = report.findings.filter((f) => f.severity !== 'info')
  const info = report.findings.filter((f) => f.severity === 'info')
  if (report.findings.length === 0) {
    lines.push('No findings.')
  }
  if (graded.length > 0) {
    lines.push('### Findings', '')
    for (const f of graded.slice(0, 10)) {
      lines.push(`- **[${f.severity[0].toUpperCase()}] ${f.id}** — ${f.title} (\`${f.confidence}\` confidence)`)
      for (const e of f.evidence.slice(0, 3)) {
        const where = e.line ? `${e.file}:${e.line}` : e.file
        lines.push(`  - \`${where}\`${e.snippet ? ` — \`${e.snippet}\`` : ''}`)
      }
    }
    if (graded.length > 10) lines.push(`- …and ${graded.length - 10} more in the report artifact`)
    lines.push('')
  }
  if (info.length > 0) {
    lines.push(`<details><summary>${info.length} info findings (never affect the grade)</summary>`, '')
    for (const f of info.slice(0, 8)) {
      lines.push(`- **${f.id}** — ${f.title}`)
    }
    if (info.length > 8) lines.push(`- …and ${info.length - 8} more`)
    lines.push('</details>', '')
  }
  lines.push(
    '---',
    'Findings are signals, not verdicts — a low-confidence finding never lowers a grade. ' +
      'A finding you believe is wrong? [Open a public dispute](https://github.com/rogerdigital/dsh-vet/issues/new?template=false-positive.md).',
  )
  return lines.join('\n')
}

// --- release comparison (baseline-report input) -----------------------------

const COMPARISON_LIMIT = 10

// Stated on every comparison section, per pilot feedback: the diff covers
// package-level static behavior only.
const SCOPE_NOTE =
  '*Scope: package-level static behavior only — behavior that depends on the composed DSH profile or host version is not visible from the package alone.*'

/** Report-derived text is untrusted: strip controls, escape markdown metacharacters. */
export function escapeMarkdown(text) {
  return String(text)
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/`/g, "'")
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function identityLine(identity) {
  return `- \`${escapeMarkdown(identity.rule)}\` · \`${escapeMarkdown(identity.file)}\` · \`${escapeMarkdown(identity.subject)}\``
}

/** Render a dsh-vet/diff/v1 result as a bounded, escaped PR-comment section. */
export function renderComparisonMarkdown(diff, { runUrl }) {
  const lines = ['### dsh-vet release comparison', '']
  if (diff.comparability !== 'comparable') {
    lines.push(
      '**Comparison unavailable** — these two reports cannot be trusted to describe the same subject under the same checks:',
      '',
    )
    for (const reason of diff.reasons ?? []) lines.push(`- \`${escapeMarkdown(reason)}\``)
    lines.push(
      '',
      'When practical, rescan both artifacts with the same scanner and profile. ' +
        'An unavailable comparison is never a claim that nothing changed. ' +
        `Full result: the \`diff.json\` file in the [run's report artifact](${runUrl}).`,
      '',
      SCOPE_NOTE,
    )
    return lines.join('\n')
  }
  const added = diff.findings?.added ?? []
  const removed = diff.findings?.removed ?? []
  const changed = diff.findings?.changed ?? []
  const obsAdded = diff.observations?.added ?? []
  lines.push(
    `**Comparison: comparable** — ${added.length} added · ${removed.length} removed · ${changed.length} changed ` +
      `(grade \`${diff.base.grade}\` → \`${diff.head.grade}\`, secondary context). ` +
      `Full result: the \`diff.json\` file in the [run's report artifact](${runUrl}).`,
  )
  if (added.length > 0 || obsAdded.length > 0) {
    lines.push('', '**Added behavior:**')
    for (const identity of added.slice(0, COMPARISON_LIMIT)) lines.push(identityLine(identity))
    if (added.length > COMPARISON_LIMIT) {
      lines.push(`- …and ${added.length - COMPARISON_LIMIT} more findings (truncated here; see the diff artifact)`)
    }
    if (obsAdded.length > added.length && obsAdded.length > COMPARISON_LIMIT) {
      lines.push(`- …plus ${obsAdded.length} added observations (see the diff artifact)`)
    }
  }
  lines.push('', SCOPE_NOTE)
  return lines.join('\n')
}

/** Render the not-usable-at-all path: baseline configured but no result produced. */
export function renderComparisonUnavailableMarkdown(reason) {
  const bounded = String(reason).replace(/[\u0000-\u001f\u007f]/g, '').replace(/`/g, "'").slice(0, 400)
  const truncated = String(reason).length > 400 ? ' (truncated)' : ''
  return [
    '### dsh-vet release comparison',
    '',
    '**Comparison unavailable** — the configured baseline could not be used:',
    '',
    '```',
    bounded || 'no comparison result was produced',
    '```' + truncated,
    '',
    'The scan report itself is unaffected and was uploaded as the report artifact. ' +
      'Fix the baseline and rerun, or unset `baseline-report` to return to scan-only mode.',
  ].join('\n')
}
