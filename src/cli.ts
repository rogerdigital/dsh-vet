/**
 * CLI (ROADMAP T4). Exit semantics per the dsh-vet/v1 spec: `0` for any
 * completed report (even a graded-F one), non-zero for scanner failure;
 * `--strict`/`--fail-on` turn threshold breaches into exit code 1.
 */

import { parseArgs } from 'node:util'
import { readFileSync } from 'node:fs'
import { SCANNER_VERSION, scan, scanDirectory } from './scanner.ts'
import type { VetReport } from './contract.ts'
import { SCHEMA_ID, isGraded } from './contract.ts'
import { renderBadge } from './badge.ts'
import { validateReport } from './validate.ts'
import { classifySpecifier } from './resolve.ts'
import { existsSync } from 'node:fs'

export interface CliIo {
  stdout: (line: string) => void
  stderr: (line: string) => void
}

const USAGE = `usage: dsh-vet <specifier> [options]
       dsh-vet badge <report.json>
       dsh-vet validate <report.json> [<report.json> ...]

  specifier            npm package (name[@version]), git URL, or local path

  --json               emit a dsh-vet/v1 report as JSON
  --strict             exit 1 when findings >= high with confidence >= medium
  --fail-on <sev>      override the --strict threshold (critical|high|medium|low)
  --rules <ids>        comma-separated rule ids to run
  --version            print version
  --help               this text

  badge                render a shields.io endpoint badge (JSON) from a
                       dsh-vet/v1 report file; used by CI to publish a grade
                       badge whose value is the committed report

  validate             check report file(s) against the dsh-vet/v1 contract;
                       the entry point for marketplaces and CI jobs consuming
                       reports from scanners they did not write`

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low', 'info'] as const

function thresholdBreach(report: VetReport, threshold: (typeof SEVERITY_ORDER)[number]): boolean {
  const limit = SEVERITY_ORDER.indexOf(threshold)
  return report.findings.some(
    (f) => isGraded(f) && SEVERITY_ORDER.indexOf(f.severity) <= limit,
  )
}

function humanSummary(report: VetReport): string {
  const lines: string[] = []
  const resolved = report.target.resolved
  const what =
    report.target.kind === 'npm-package'
      ? `${report.target.specifier}${resolved?.version ? ` (resolved ${resolved.version})` : ''}`
      : report.target.specifier
  lines.push(`dsh-vet ${SCANNER_VERSION} · ${report.target.kind} · ${what}`)
  lines.push(`grade: ${report.summary.grade}`)
  const c = report.summary.counts
  lines.push(
    `findings: ${c.critical} critical · ${c.high} high · ${c.medium} medium · ${c.low} low · ${c.info} info`,
  )
  if (report.findings.length > 0) lines.push('')
  for (const f of report.findings) {
    lines.push(`[${f.severity[0]!.toUpperCase()}] ${f.id} — ${f.title} (${f.confidence} confidence)`)
    for (const e of f.evidence) {
      const where = e.line ? `${e.file}:${e.line}` : e.file
      lines.push(`    ${where}${e.snippet ? `  ${e.snippet}` : ''}`)
      if (e.note) lines.push(`      ${e.note}`)
    }
    if (f.remediation) lines.push(`    fix: ${f.remediation}`)
    lines.push('')
  }
  return lines.join('\n')
}

/** Parse and run; returns the process exit code. */
export async function runCli(argv: string[], io: CliIo): Promise<number> {
  if (argv[0] === 'badge') {
    return runBadge(argv.slice(1), io)
  }
  if (argv[0] === 'validate') {
    return runValidate(argv.slice(1), io)
  }
  let args: ReturnType<typeof parseArgs>
  try {
    args = parseArgs({
      args: argv,
      options: {
        json: { type: 'boolean' },
        strict: { type: 'boolean' },
        'fail-on': { type: 'string' },
        rules: { type: 'string' },
        version: { type: 'boolean' },
        help: { type: 'boolean' },
      },
      allowPositionals: true,
    })
  } catch (err) {
    io.stderr(`${(err as Error).message}\n\n${USAGE}`)
    return 2
  }

  if (args.values.version) {
    io.stdout(SCANNER_VERSION)
    return 0
  }
  if (args.values.help) {
    io.stdout(USAGE)
    return 0
  }

  const specifier = args.positionals[0]
  if (!specifier || args.positionals.length > 1) {
    io.stderr(`expected exactly one specifier\n\n${USAGE}`)
    return 2
  }

  const failOn = (args.values['fail-on'] ?? (args.values.strict ? 'high' : null)) as string | null
  if (failOn !== null && !SEVERITY_ORDER.includes(failOn as any)) {
    io.stderr(`invalid --fail-on severity: ${failOn}\n\n${USAGE}`)
    return 2
  }

  const rulesArg = args.values.rules
  const rules = typeof rulesArg === 'string' ? rulesArg.split(',').map((r) => r.trim()).filter(Boolean) : undefined
  try {
    // A plain name that is a directory on disk is a local scan; everything
    // else goes through the resolver (registry, git, or explicit path).
    const report =
      classifySpecifier(specifier) === 'local-path' && existsSync(specifier)
        ? await scanDirectory(specifier, { rules })
        : await scan(specifier, { rules })

    if (args.values.json) {
      io.stdout(JSON.stringify(report, null, 2))
    } else {
      io.stdout(humanSummary(report))
    }
    if (failOn !== null && thresholdBreach(report, failOn as (typeof SEVERITY_ORDER)[number])) {
      io.stderr(`threshold breached: findings at or above ${failOn} (confidence >= medium)`)
      return 1
    }
    return 0
  } catch (err) {
    io.stderr(`dsh-vet: ${(err as Error).message}`)
    return 2
  }
}

function runBadge(argv: string[], io: CliIo): number {
  const path = argv[0]
  if (!path || argv.length > 1 || path === '--help') {
    io.stderr(`usage: dsh-vet badge <report.json>\n\nRender a shields.io endpoint badge from a dsh-vet/v1 report.`)
    return 2
  }
  let report: VetReport
  try {
    report = JSON.parse(readFileSync(path, 'utf8')) as VetReport
  } catch (err) {
    io.stderr(`dsh-vet badge: cannot read report: ${(err as Error).message}`)
    return 2
  }
  if (report.schema !== SCHEMA_ID) {
    io.stderr(`dsh-vet badge: not a ${SCHEMA_ID} report (schema: ${String(report.schema)})`)
    return 2
  }
  io.stdout(JSON.stringify(renderBadge(report)))
  return 0
}

/**
 * `dsh-vet validate <report.json> [...]` — check reports against the
 * contract. Exit 0 when every file is valid, 1 when any is invalid (the
 * issues are data, printed for repair), 2 on usage or unreadable files.
 */
function runValidate(argv: string[], io: CliIo): number {
  const paths = argv.filter((arg) => arg !== '--help')
  if (paths.length === 0 || argv.includes('--help')) {
    io.stderr(`usage: dsh-vet validate <report.json> [<report.json> ...]\n\nCheck report file(s) against the dsh-vet/v1 contract.`)
    return 2
  }
  let worst = 0
  for (const path of paths) {
    let parsed: unknown
    try {
      parsed = JSON.parse(readFileSync(path, 'utf8'))
    } catch (err) {
      io.stderr(`dsh-vet validate: cannot read report: ${(err as Error).message}`)
      return 2
    }
    const { ok, issues } = validateReport(parsed)
    if (ok) {
      io.stdout(`ok      ${path}`)
      continue
    }
    worst = 1
    io.stdout(`invalid ${path}`)
    for (const issue of issues) {
      io.stdout(`  ${issue.path}: ${issue.message}`)
    }
  }
  return worst
}
