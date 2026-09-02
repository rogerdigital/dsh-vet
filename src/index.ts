/**
 * `dsh-vet`: security vetting for DeepSeek Harness (DSH) plugins, built
 * around the open `dsh-vet/v1` report contract. This module ships the
 * contract's reference types and grading logic plus the reference scanner
 * pipeline (`scan`, `scanDirectory`, `runRules`).
 *
 * @module dsh-vet
 */

export {
  SCHEMA_ID,
  RULE_ID_PATTERN,
  SEVERITY_RANK,
  countFindings,
  createReport,
  gradeFor,
  isGraded,
} from './contract.ts'
export type {
  VetConfidence,
  VetEvidence,
  VetFinding,
  VetGrade,
  VetReport,
  VetScanner,
  VetSeverity,
  VetSummary,
  VetSummaryCounts,
  VetTarget,
  VetTargetKind,
  CreateReportInput,
} from './contract.ts'

export { analyze, reachableFrom } from './analyze.ts'
export type {
  Analysis,
  Capability,
  CapabilityUse,
  CharcodeCall,
  DynamicImportUse,
  EncodedLiteral,
  EvalUse,
  ImportRef,
  NetUse,
  PkgJson,
  SourceFile,
} from './analyze.ts'

export { classifySpecifier, parseNpmSpecifier, resolveTarget, VetError } from './resolve.ts'
export type { ResolveOptions, ResolvedTarget, SpecifierKind } from './resolve.ts'

export { RULES, ruleIds, runRules } from './rules/index.ts'
export type { Rule, RuleContext, FindingInit } from './rule.ts'

export { SCANNER_VERSION, scan, scanDirectory } from './scanner.ts'
export type { ScanOptions } from './scanner.ts'

export { renderBadge } from './badge.ts'
export type { ShieldsEndpointBadge } from './badge.ts'

export { renderMarkdown } from './render.ts'
export type { RenderMarkdownOptions } from './render.ts'

export { validateReport } from './validate.ts'
export type { ValidationIssue, ValidationResult } from './validate.ts'

export { runCli } from './cli.ts'
export type { CliIo } from './cli.ts'
