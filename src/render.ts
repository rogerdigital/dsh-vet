/**
 * Reference markdown rendering of a `dsh-vet/v1` report (ROADMAP v0.3): the
 * same output the GitHub Action posts as a PR comment, exported so
 * marketplaces and CI integrations can render reports without reimplementing
 * it. Pure — report in, markdown out, nothing else.
 *
 * `action/scripts/render.mjs` carries a dependency-free copy because the
 * composite action must not depend on the installed scanner version;
 * `test/render.test.ts` asserts the two implementations stay identical.
 */

import type { VetReport } from './contract.ts'

export interface RenderMarkdownOptions {
  /** Link to the CI run or page hosting the full report. */
  runUrl: string
}

export function renderMarkdown(report: VetReport, options: RenderMarkdownOptions): string {
  const c = report.summary.counts
  const lines = [
    '<!-- dsh-vet:pr-comment -->',
    '## dsh-vet report',
    '',
    `**Grade: ${report.summary.grade}** · audited \`${report.target.specifier}\` · [run](${options.runUrl}) · report uploaded as the \`dsh-vet-report\` artifact`,
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
      lines.push(`- **[${f.severity[0]!.toUpperCase()}] ${f.id}** — ${f.title} (\`${f.confidence}\` confidence)`)
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
