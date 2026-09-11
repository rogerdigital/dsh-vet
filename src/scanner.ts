/**
 * Scanner orchestration: resolve → analyze → rules → report. The only ambient
 * state in a report is `scanner.ranAt`; everything else is derived, so two runs
 * over the same artifact with the same version are identical.
 */

import { analyze } from './analyze.ts'
import type { Analysis } from './analyze.ts'
import { resolveTarget } from './resolve.ts'
import type { ResolvedTarget, ResolveOptions } from './resolve.ts'
import { createReport } from './contract.ts'
import type { VetFinding, VetReport } from './contract.ts'
import { runRules, ruleIds, RULES } from './rules/index.ts'
import { ANALYSIS_INPUT_DIGEST_KIND, profileDigest } from './scan-context.ts'
import type { ScanContextV1, ScanOmissionV1 } from './scan-context.ts'
import { analysisInputDigest } from './identity.ts'
import { deriveFindingIdentities, deriveObservations } from './observations.ts'

/** Kept in lockstep with package.json; a test asserts they match. */
export const SCANNER_VERSION = '0.4.0'

/**
 * Fixed limitations of the reference scanner's scope, reported even on
 * complete coverage: `complete` means complete within this scope, nothing
 * broader. Sorted: coverage validation requires it.
 */
const FIXED_LIMITATIONS = [
  'dependencies are not scanned',
  'non-JavaScript files and executables are not analyzed',
  'static analysis cannot observe runtime-computed behavior',
].sort()

const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** The automatic empty-audit check runs on every scan, alongside selected rules. */
function effectiveRuleIds(options: ScanOptions): string[] {
  return [...new Set([...(options.rules ?? ruleIds()), 'scan.empty-audit'])].sort(compareText)
}

function isFullRuleSelection(options: ScanOptions): boolean {
  if (!options.rules) return true
  const all = new Set(ruleIds())
  return options.rules.length === all.size && options.rules.every((id) => all.has(id))
}

function scanOmissions(analysis: Analysis, resolved?: ResolvedTarget): ScanOmissionV1[] {
  const omissions: ScanOmissionV1[] = analysis.omissions.map((omit) => ({ ...omit }))
  for (const link of resolved?.skippedLinks ?? []) {
    omissions.push({ reason: 'archive-link-skipped', path: link.path, detail: `${link.type} → ${link.target}` })
  }
  return omissions.sort((a, b) => compareText(a.path, b.path) || compareText(a.reason, b.reason))
}

function buildScanContext(
  analysis: Analysis,
  options: ScanOptions,
  findings: readonly VetFinding[],
  emptyAuditRan: boolean,
  resolved?: ResolvedTarget,
): ScanContextV1 {
  const rules = effectiveRuleIds(options)
  const profileFields = {
    analyzerRevision: `dsh-vet-analyzer/${SCANNER_VERSION}`,
    ruleCatalogRevision: `dsh-vet-rules/${SCANNER_VERSION}`,
    rules,
    options: {},
  }
  const omissions = scanOmissions(analysis, resolved)
  const failedFiles = analysis.files
    .filter((file) => file.parseError !== null)
    .map((file) => file.path)
    .sort(compareText)
  const partial =
    analysis.files.length === 0 ||
    failedFiles.length > 0 ||
    analysis.unresolvedEntries.length > 0 ||
    omissions.length > 0 ||
    !isFullRuleSelection(options)
  return {
    version: 1,
    profile: { ...profileFields, digest: profileDigest(profileFields) },
    coverage: {
      status: partial ? 'partial' : 'complete',
      candidateJs: analysis.files.length,
      parsed: analysis.files.length - failedFiles.length,
      parseFailures: failedFiles.length,
      failedFiles,
      entries: { resolved: analysis.entries, unresolved: analysis.unresolvedEntries },
      omissions,
      dependencyMode: 'not-scanned',
      limitations: FIXED_LIMITATIONS,
    },
    subject: {
      ...(analysis.pkg?.name ? { packageName: analysis.pkg.name } : {}),
      analysisInputDigest: analysisInputDigest(analysis.inputs),
      digestKind: ANALYSIS_INPUT_DIGEST_KIND,
      ...(resolved?.archiveDigest ? { archiveDigest: resolved.archiveDigest } : {}),
    },
    observations: deriveObservations(analysis),
    findingIdentities: deriveFindingIdentities(analysis, findings, RULES, { emptyAuditRan }),
  }
}

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
  const emptyAuditRan = analysis.files.length === 0
  if (emptyAuditRan) findings.push(emptyAuditFinding(dir))
  const scannerBlock = {
    name: 'dsh-vet',
    version: SCANNER_VERSION,
    ranAt: options.now?.() ?? new Date().toISOString(),
  }
  // A draft report establishes the contract's deterministic finding order;
  // identity indexes must point into that final order, not the pre-sort one.
  const draft = createReport({ target: { kind: 'local-path', specifier: dir }, scanner: scannerBlock, findings })
  return createReport({
    target: { kind: 'local-path', specifier: dir },
    scanner: scannerBlock,
    findings,
    context: buildScanContext(analysis, options, draft.findings, emptyAuditRan),
  })
}

export async function scan(specifier: string, options: ScanOptions = {}): Promise<VetReport> {
  const resolved = await resolveTarget(specifier, options)
  try {
    const analysis = analyze(resolved.rootDir)
    const findings = options.rules ? runRules(analysis, options.rules) : runRules(analysis)
    const emptyAuditRan = analysis.files.length === 0
    if (emptyAuditRan) findings.push(emptyAuditFinding(specifier))
    const scannerBlock = {
      name: 'dsh-vet',
      version: SCANNER_VERSION,
      ranAt: options.now?.() ?? new Date().toISOString(),
    }
    const draft = createReport({ target: resolved.target, scanner: scannerBlock, findings })
    return createReport({
      target: resolved.target,
      scanner: scannerBlock,
      findings,
      context: buildScanContext(analysis, options, draft.findings, emptyAuditRan, resolved),
    })
  } finally {
    resolved.cleanup()
  }
}
