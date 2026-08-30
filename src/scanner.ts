/**
 * Scanner orchestration: resolve → analyze → rules → report. The only ambient
 * state in a report is `scanner.ranAt`; everything else is derived, so two runs
 * over the same artifact with the same version are identical.
 */

import { analyze } from './analyze.ts'
import { resolveTarget } from './resolve.ts'
import type { ResolveOptions } from './resolve.ts'
import { createReport } from './contract.ts'
import type { VetReport } from './contract.ts'
import { runRules } from './rules/index.ts'

/** Kept in lockstep with package.json; a test asserts they match. */
export const SCANNER_VERSION = '0.2.0'

export interface ScanOptions extends ResolveOptions {
  /** Injectable clock for deterministic tests/reports. */
  now?: () => string
  /** Restrict the scan to these rule ids (CLI `--rules`). */
  rules?: string[]
}

export async function scanDirectory(dir: string, options: ScanOptions = {}): Promise<VetReport> {
  const analysis = analyze(dir)
  return createReport({
    target: { kind: 'local-path', specifier: dir },
    scanner: {
      name: 'dsh-vet',
      version: SCANNER_VERSION,
      ranAt: options.now?.() ?? new Date().toISOString(),
    },
    findings: options.rules ? runRules(analysis, options.rules) : runRules(analysis),
  })
}

export async function scan(specifier: string, options: ScanOptions = {}): Promise<VetReport> {
  const resolved = await resolveTarget(specifier, options)
  try {
    const analysis = analyze(resolved.rootDir)
    return createReport({
      target: resolved.target,
      scanner: {
        name: 'dsh-vet',
        version: SCANNER_VERSION,
        ranAt: options.now?.() ?? new Date().toISOString(),
      },
      findings: options.rules ? runRules(analysis, options.rules) : runRules(analysis),
    })
  } finally {
    resolved.cleanup()
  }
}
