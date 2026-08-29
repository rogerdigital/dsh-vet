/**
 * `dsh-vet`: security vetting for DeepSeek Harness (DSH) plugins, built
 * around the open `dsh-vet/v1` report contract. This module currently ships
 * the contract's reference types and grading logic; the reference scanner
 * and CLI land in v0.1 (see the README roadmap).
 *
 * @module dsh-vet
 */

export {
  SCHEMA_ID,
  RULE_ID_PATTERN,
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
