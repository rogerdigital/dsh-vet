// Pure rendering for dsh-vet CI output: PR-comment markdown and the shields
// badge JSON. No side effects, no deps — importable from tests.

const GRADE_COLOR = {
  A: 'brightgreen', B: 'green', C: 'yellow', D: 'orange', F: 'red', X: 'lightgrey',
}

export function renderBadgeJson(report) {
  const grade = report.summary.grade
  return {
    schemaVersion: 1,
    label: 'dsh-vet',
    message: grade === 'X' ? 'scan failed' : `grade ${grade}`,
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
    `**Grade: ${report.summary.grade}** · audited \`${report.target.specifier}\` · [run](${runUrl}) · report uploaded as the \`dsh-vet-report\` artifact`,
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
