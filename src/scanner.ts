/**
 * Scanner orchestration: resolve → analyze → rules → report. The only ambient
 * state in a report is `scanner.ranAt`; everything else is derived, so two runs
 * over the same artifact with the same version are identical.
 */

import { analyze } from './analyze.ts'
import { resolveTarget } from './resolve.ts'
import type { ResolveOptions } from './resolve.ts'
import { createReport } from './contract.ts'
import type { VetFinding, VetReport } from './contract.ts'
import { runRules } from './rules/index.ts'

/** Kept in lockstep with package.json; a test asserts they match. */
export const SCANNER_VERSION = '0.2.2'

/**
 * A scan that audited zero JavaScript files must not read as a clean pass —
 * a TypeScript source tree scanned as a local path has no `.js` to analyze,
 * and silence there would be an A-by-vacuity. (Found live during v0.2
 * activation; docs/rules/scan.empty-audit.md.)
 */
function emptyAuditFinding(targetSpecifier: string): VetFinding {
  return {
    id: 'scan.empty-audit',
    title: 'No analyzable JavaScript found in the target',
    severity: 'medium',
    confidence: 'high',
    evidence: [{ file: '.', note: `zero .js/.mjs/.cjs files (or Node-shebang bin scripts) found under ${targetSpecifier}` }],
    remediation:
      'Audit what actually ships: pass the npm package specifier (or a directory containing the built output) instead of the source tree.',
    references: ['https://github.com/rogerdigital/dsh-vet/blob/main/docs/rules/scan.empty-audit.md'],
  }
}

export interface ScanOptions extends ResolveOptions {
  /** Injectable clock for deterministic tests/reports. */
  now?: () => string
  /** Restrict the scan to these rule ids (CLI `--rules`). */
  rules?: string[]
}

export async function scanDirectory(dir: string, options: ScanOptions = {}): Promise<VetReport> {
  const analysis = analyze(dir)
  const findings = options.rules ? runRules(analysis, options.rules) : runRules(analysis)
  if (analysis.files.length === 0) findings.push(emptyAuditFinding(dir))
  return createReport({
    target: { kind: 'local-path', specifier: dir },
    scanner: {
      name: 'dsh-vet',
      version: SCANNER_VERSION,
      ranAt: options.now?.() ?? new Date().toISOString(),
    },
    findings,
  })
}

export async function scan(specifier: string, options: ScanOptions = {}): Promise<VetReport> {
  const resolved = await resolveTarget(specifier, options)
  try {
    const analysis = analyze(resolved.rootDir)
    const findings = options.rules ? runRules(analysis, options.rules) : runRules(analysis)
    if (analysis.files.length === 0) findings.push(emptyAuditFinding(specifier))
    return createReport({
      target: resolved.target,
      scanner: {
        name: 'dsh-vet',
        version: SCANNER_VERSION,
        ranAt: options.now?.() ?? new Date().toISOString(),
      },
      findings,
    })
  } finally {
    resolved.cleanup()
  }
}
