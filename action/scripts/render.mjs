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
