// The consumer workflow in one file: validate → coverage → applicability
// → render. See docs/consumer-conformance.md.
//
//   node examples/consumer/consume-report.mjs <report.json> [run-url]
//
// Imports the published package ('dsh-vet'), like a real consumer would.
// From a repo checkout run `pnpm build` first — lib/ is not committed.
import { readFileSync } from 'node:fs'

export const APPLICABILITY_UNSUPPORTED =
  'applicability: not supported by this kit yet — report/artifact matching ships behind its own milestone; a grade is never evidence that a report matches the artifact in front of you'

export function assess(report, api, options = {}) {
  const runUrl = options.runUrl ?? 'unlinked report'
  const validation = api.validateReport(report)
  return {
    valid: validation.ok,
    issues: validation.issues,
    coverage: api.coverageOf(report),
    applicability: APPLICABILITY_UNSUPPORTED,
    markdown: validation.ok ? api.renderMarkdown(report, { runUrl }) : null,
  }
}

const [reportPath, runUrl] = process.argv.slice(2)
if (reportPath) {
  const api = await import('dsh-vet')
  const report = JSON.parse(readFileSync(reportPath, 'utf8'))
  const out = assess(report, api, runUrl ? { runUrl } : {})
  console.log(
    JSON.stringify(
      { valid: out.valid, coverage: out.coverage, applicability: out.applicability, issues: out.issues },
      null,
      2,
    ),
  )
  if (out.markdown) console.log(out.markdown)
  process.exitCode = out.valid ? 0 : 1
} else {
  console.error('usage: node examples/consumer/consume-report.mjs <report.json> [run-url]')
  process.exitCode = 2
}
