# Release and Upgrade Risk Review Development Plan

**Status:** Proposed; implementation has not started.
**Date:** 2026-09-10
**Goal:** Make every plugin release review explain which artifact was checked, the limits of that check, and the risk-relevant changes since the previous release.
**Architecture:** Extend the existing static pipeline and report envelope without changing v1 grading. Build comparison and policy evaluation as separate pure consumers of reports; reuse the CLI, renderer, and GitHub Action for delivery.
**Tech stack:** TypeScript, Node.js >=20, Acorn, Vitest, tsdown, pnpm, composite GitHub Action. Use Node's crypto primitives for content digests; no new runtime dependency is planned for the first milestone.

## 1. Product decision

The primary user is a plugin author or maintainer reviewing a release or dependency upgrade. The secondary user is a marketplace or installer consuming the resulting report. Individual users retain the existing one-command scan workflow.

Prioritize three questions:

1. What exact content does this report describe?
2. Which checks ran, and what could they not inspect?
3. What risk-relevant behavior changed since the baseline?

The first milestone is **scan context + comparable reports + PR change summaries**. It must deliver value before adoption of the report contract by another project. Marketplace feedback runs alongside development, not after an indefinite feature-completion phase.

### Alternatives considered

| Direction | Benefit | Decision |
| --- | --- | --- |
| Broad rule expansion | Detect additional patterns | Continue targeted maintenance, not the main expansion strategy |
| Runtime guard, installer, or web management panel | More direct end-user interaction | Out of scope; changes the operating model and overlaps complementary tools |
| Artifact-aware release review | Recurring author workflow; reports useful to consumers | Selected |

Non-goals: runtime interception, installing/executing audited plugins, a marketplace, a hosted report service, a proprietary signing service, arbitrary recursive dependency execution, or claims that a passing report certifies safety.

## 2. Verified starting point

This plan is based on the local 0.3.0 source, not a claim about the latest public release.

| Existing surface | Evidence | Consequence for the plan |
| --- | --- | --- |
| Resolve → analyze → rules → report | `src/scanner.ts`, `src/resolve.ts` | Extend the existing pipeline |
| npm integrity verification and version recording | `src/resolve.ts` | Reuse verification; add explicit digest semantics |
| JavaScript analysis, module graph, capability observations | `src/analyze.ts` | Reuse observations instead of parsing twice |
| 15 selectable rules plus automatic empty-audit finding | `src/rules/index.ts`, `src/scanner.ts` | Record actual executed rules, including automatic checks |
| Derived grade and structural validation | `src/contract.ts`, `src/validate.ts` | Keep grade semantics; add independent scan-context validation |
| CLI scan, validate, badge | `src/cli.ts` | Add comparison as a separate subcommand |
| Library and Action Markdown renderers | `src/render.ts`, `action/scripts/render.mjs` | Preserve their parity tests |
| Report publication and PR comments | `action/action.yml`, `action/scripts/post-results.mjs` | Add optional baseline processing without replacing current scan behavior |
| Golden fixtures and verification scripts | `test/golden.test.ts`, `package.json` | Extend regression tests and run the existing release gate |

The preceding inspection ran 89 tests across 11 files successfully. Implementation must refresh this baseline; that result is not validation of the planned features.

### Existing inconsistencies to resolve first

- The v1 document's A-grade row includes low-severity findings, while `gradeFor()` assigns B to graded low findings. Correct the document to match established implementation and tests; do not change scoring.
- Structural validation verifies internal consistency, not emitter honesty, omitted findings, artifact identity, or provenance. Tighten the consumer documentation accordingly.
- Reports do not currently identify the selected rule set. A subset scan can look equivalent to an all-rules scan.
- `ResolvedTarget.skippedLinks` exists for archive extraction but is not carried into the report.
- Golden tests create missing expected files automatically. New release-review regression tests must fail when their expected artifacts are missing; review generated golden changes explicitly.

## 3. Milestones and gates

| Milestone | Deliverable | Dependency | Exit gate |
| --- | --- | --- | --- |
| M0 | Contract wording and baseline fixtures | None | Existing grade behavior preserved; consumer trust boundaries documented |
| M1 | Scan context, content identity, comparison CLI, PR summary | M0 | Acceptance matrix in section 7 passes; real release pair reviewed |
| M2 | New-risk CI policy and scoped exceptions | M1 plus useful pilot feedback | Accepted risks never alter original findings or grade |
| M3 | Consumer artifact matching | M1 content identity | Matching, mismatch, and unavailable states verified independently of grade |
| M4 | Public calibration and consumer conformance kit | Start with M0; expand through all milestones | Reproducible cases and one external integration exercise |

M2 and M3 are independently releasable after M1. Do not implement them in the M1 pull requests. Publish a separate implementation specification for each when its entry gate is met. Existing v0.3 adoption and freeze goals remain in `ROADMAP.md`; this plan does not mark them complete or assign an unverified release version.

## 4. M1 design decisions

### 4.1 Compatible scan context

Introduce an optional `x-dsh-vet` extension with its own `version: 1`. Old v1 reports remain valid and renderable. Missing extension data means **unknown**, never full coverage. Unknown vendor extensions remain tolerated.

The extension contains these separately typed areas:

| Area | Required content when emitted |
| --- | --- |
| `profile` | Analyzer revision, rule catalog revision, sorted effective rule IDs, effective scan options, deterministic profile digest |
| `coverage` | Candidate JS count, parsed count, parse-failure count, resolved/unresolved entry hints, known omissions with reasons, dependency mode |
| `subject` | Package name when present, content digest, digest kind/version, optional archive digest |
| `observations` | Structured risk observations and stable identities for findings |

Document and implement concrete TypeScript definitions before producer changes. Every emitted count must have a defined population: candidate JS files exclude ignored directories and unsupported formats. Directory omissions are not reported as fabricated file counts. Dependency mode initially states `not-scanned`.

Coverage uses `complete`, `partial`, or `unknown`, with **complete within the documented static JS scope** as the user-facing meaning. Partial conditions include subset rules, zero JS, parse failures, unresolved declared entries, unsupported executable inputs observed in the target, and skipped archive links. A complete status never asserts complete behavioral analysis or dependency coverage. List fixed limitations even on complete reports. An unresolved entry affects completeness without pretending that all files were unscanned.

Keep `summary.grade` unchanged. Human output includes coverage alongside grade. Badge output includes `partial` or `coverage unknown` when applicable rather than presenting an unqualified green pass. Historical reports retain their original grade and validate under the original contract.

Known extension version 1 must be validated for enum, integer, sorting, uniqueness, cross-count, and digest consistency constraints. Future extension versions may remain valid base reports but are unsupported for comparison until understood. Never treat an unknown extension as trusted comparison metadata.

### 4.2 Content identity

Use two explicitly different digests:

- **Archive digest:** SHA-256 over exact downloaded or supplied archive bytes. Continue registry-integrity verification independently.
- **Analysis-input digest:** SHA-256 over a sorted manifest of relative POSIX paths, content byte lengths, and SHA-256 hashes for exact bytes consumed by analysis, including `package.json`. Serialize the manifest using a documented canonical JSON encoding with a digest-format version.

Read and hash the same byte snapshots that analysis consumes. Do not hash files later in a second walk. Exclude machine-specific root paths and timestamps. Git commit identity alone does not identify a dirty checkout; local reports describe captured inputs, not an atomic filesystem snapshot. Use regular files only and do not follow symbolic links outside the target.

The analysis-input digest is not a digest of every packaged file, and must never be labeled as full-package integrity. Adding a non-analyzed README can preserve that digest while changing the archive digest. A source directory and its built npm package are not interchangeable verification targets.

Generated reports and golden files must not become inputs to their own digest. When adding new analyzed inputs in future, update the analyzer/profile and digest semantics deliberately.

### 4.3 Stable observations and finding identities

Use structured facts instead of diffing human titles or snippets. Initially extract only facts supported by the existing analysis: capabilities, literal outbound hosts, install lifecycle scripts, and identified sensitive reads. Describe a detected sensitive read precisely; co-occurrence with a host is not proof of exfiltration.

Observation identity uses kind + relative file + normalized subject. Finding identity uses rule ID + rule-specific semantic subject + relative file. Exclude line number, display title, severity, confidence, and code formatting. Canonicalize hostnames without query strings, credentials, or secret-bearing URL paths. Keep policy-relevant differences such as destination port explicit.

Rules that currently aggregate several evidence items must expose per-subject identities so adding a second endpoint is detectable. Represent duplicate identical subjects as counts rather than unstable ordinal IDs. A file rename may appear as removal/addition in M1; no rename inference is promised. Unsupported identities produce a limitation, not a guessed match.

Do not emit secret values in new metadata. Avoid arbitrary literals in identity fields; prefer safe API names, environment-variable identifiers, normalized hosts, and hashes where content matching is necessary. Existing snippet generation must receive focused regression checks for any cases touched by the new extraction.

### 4.4 Comparison contract

Add the pure API `compareReports(base, head)` in `src/compare.ts` and a separate versioned result envelope `dsh-vet/diff/v1`. The function does not fetch packages, mutate reports, or recalculate them under new rules.

Result fields include `schema`, subject references for both reports, `comparability`, explicit `reasons`, and change collections: `added`, `removed`, `changed`, `unchanged`, plus behavior-observation deltas. A changed match records both sides. Stable sorting makes output deterministic.

Comparability requires valid supported context, matching scanner name/version and profile digest, matching package identity, and complete coverage on both sides. Different artifact digests are expected. For local directories without package identity, require an explicit shared subject label through the CLI/API options; never infer identity from temporary absolute paths.

Missing context, an X grade, partial coverage, a profile mismatch, or identity ambiguity yields `incomparable`. Return explanations and both report summaries but no definitive risk-reduction claim. In M1 do not implement a force-comparison switch. Consumers should rescan both artifacts with the same configuration when practical.

Classify severity/confidence changes separately from added findings. Moving from low confidence to medium confidence can introduce a graded risk even at the same severity. Observation deltas remain visible even if grades are identical or the observations are informational. A removed finding means no longer observed under comparable checks, not proven fixed.

### 4.5 CLI and presentation

Proposed interface; these commands do not exist yet:

```sh
dsh-vet diff base.report.json head.report.json
dsh-vet diff --json base.report.json head.report.json
dsh-vet diff --subject example-plugin base.report.json head.report.json
```

M1 exit codes: 0 for a valid comparable result, regardless of risk changes; 1 for valid reports that cannot be compared; 2 for usage, file-reading, or validation failure. JSON goes to stdout and diagnostics to stderr. Do not introduce a policy threshold until M2. Existing scan exit codes remain unchanged.

The summary begins with comparability, baseline/head identity, and added behavior. Display changed grade only as secondary context. Show bounded details in PR comments with links to complete reports and the diff artifact. Escape untrusted Markdown content and keep output truncation visible.

Direct `package@old` versus `package@new` comparison is a later convenience after report comparison is proven. It must resolve each version explicitly, scan both with the same installed scanner/profile, and display the resolved versions; never silently compare mutable tags.

### 4.6 Action integration and baseline trust

Add an optional `baseline-report` input naming a report file supplied by the caller. An empty input preserves scan-only mode. Do not automatically trust a mutable latest report branch as the baseline for every PR.

For gating-ready use, baseline bytes must come from the protected base commit or a trusted run pinned to that commit. The integration recipe records the baseline commit and artifact identity. A checked-in path controlled by the PR head is not an authoritative baseline. M1 must document this boundary even though its delta summary is informational.

On configured comparison failure, preserve the current report and render why comparison was unavailable; propagate non-zero status after uploading available artifacts. Missing optional comment permissions must not erase reports. Fork PRs receive artifact/job-summary output without requiring a write token. Do not use a privileged workflow to execute PR-controlled package scripts.

Pass new inputs through environment variables and quoted argument arrays. Keep baseline lookup separate from report publication. Continue one edited-in-place PR comment. Synchronize both renderers and their type declaration when extending presentation.

## 5. M1 implementation work packages

These packages are intended as small ordered pull requests. Within each code task: add the named regression case, observe its failure, implement the smallest change, run the focused suite, then commit. Implementation-level function bodies belong in each package's execution specification, not this cross-milestone plan.

### T0 — Establish contract and regression baseline

**Modify:** `docs/dsh-vet-v1.md`, `docs/adopt-marketplace.md`, `docs/emitters.md`, `test/contract.test.ts`, `test/validate.test.ts`.

- [ ] Run `pnpm typecheck` and `pnpm test`; record failures before editing.
- [ ] Correct the A/B documentation contradiction using existing `gradeFor()` behavior.
- [ ] Document structural conformance versus completeness, identity, and origin verification.
- [ ] Preserve an old report without extensions as a compatibility fixture under `test/fixtures/release-risk/`.
- [ ] Assert old reports still validate, low-confidence findings do not lower grades, and graded low findings yield B.
- [ ] Validate with `pnpm exec vitest run test/contract.test.ts test/validate.test.ts`.

Suggested commit: `docs: clarify report grading and validation guarantees`.

### T1 — Define and validate scan context

**Create:** `src/scan-context.ts`, `test/scan-context.test.ts`, `docs/scan-context-v1.md`.
**Modify:** `src/contract.ts`, `src/validate.ts`, `src/index.ts`, `test/validate.test.ts`.

- [ ] Specify extension fields, digest encodings, profile contents, omissions, and coverage invariants from section 4.
- [ ] Add fixtures for absent context, supported context, malformed counts, duplicate rule IDs, and unsupported future context.
- [ ] Implement extension types and pure validation helpers without changing legacy grade derivation.
- [ ] Confirm unknown vendor fields remain tolerated while malformed known context is rejected.
- [ ] Validate with `pnpm exec vitest run test/scan-context.test.ts test/validate.test.ts test/contract.test.ts`.

Suggested commit: `feat: define versioned scan context`.

### T2 — Capture coverage and content identity

**Create:** `src/identity.ts`, `test/identity.test.ts`.
**Modify:** `src/analyze.ts`, `src/resolve.ts`, `src/scanner.ts`, `test/analyze.test.ts`, `test/resolve.test.ts`, `test/scanner.test.ts`.

- [ ] Add controlled targets for parse failure, missing entry, zero JS, selected rules, skipped link, and a Node-shebang executable.
- [ ] Capture analysis input bytes once and generate the versioned manifest digest from those snapshots.
- [ ] Add the exact archive digest while retaining registry integrity verification.
- [ ] Carry extraction omissions and effective rule selection into scan context; include automatic empty-audit execution.
- [ ] Test deterministic digests across different roots, a changed JS byte, changed package metadata, and README-only changes.
- [ ] Validate with `pnpm exec vitest run test/identity.test.ts test/analyze.test.ts test/resolve.test.ts test/scanner.test.ts`.

Suggested commit: `feat: record scan coverage and content identity`.

### T3 — Emit stable risk observations

**Create:** `src/observations.ts`, `test/observations.test.ts`.
**Modify:** `src/analyze.ts`, `src/rule.ts`, `src/rules/perm.ts`, `src/rules/dep.ts`, `src/rules/obf.ts`, `src/rules/egress.ts`, `src/scanner.ts`.

- [ ] Define per-rule identity subjects for all shipped finding types; record unsupported cases explicitly.
- [ ] Add paired fixtures for line insertion, formatting changes, a second host, repeated identical calls, and increased confidence.
- [ ] Derive observations from existing analysis; do not run an additional source parser.
- [ ] Add a secret-bearing URL fixture and assert emitted identity/observation fields omit credentials and query values.
- [ ] Validate with `pnpm exec vitest run test/observations.test.ts test/scanner.test.ts`.

Suggested commit: `feat: emit stable risk observations`.

### T4 — Compare reports as pure data

**Create:** `src/compare.ts`, `test/compare.test.ts`, `docs/report-diff-v1.md`.
**Modify:** `src/index.ts`.

- [ ] Specify the diff result and reason codes before exposing the public API.
- [ ] Add tests for every comparability condition and for additions, removals, matched changes, and repeated subjects.
- [ ] Implement deterministic matching with explicit per-subject counts and both sides of changed findings.
- [ ] Prove line movement does not create risk additions and that unchanged grades do not hide new observations.
- [ ] Freeze inputs in tests and assert the comparator does not mutate either report.
- [ ] Validate with `pnpm exec vitest run test/compare.test.ts`.

Suggested commit: `feat: compare compatible audit reports`.

### T5 — Expose comparison and coverage in user output

**Create:** `src/render-diff.ts`, `test/render-diff.test.ts`.
**Modify:** `src/cli.ts`, `src/render.ts`, `src/badge.ts`, `src/index.ts`, `test/cli.test.ts`, `test/render.test.ts`, `test/badge.test.ts`, `README.md`.

- [ ] Implement the three CLI forms and exit-code table in section 4.5.
- [ ] Add human/JSON tests for success, incomparable inputs, invalid reports, missing files, and wrong argument count.
- [ ] Show coverage alongside grade, including unknown coverage on old reports.
- [ ] Escape file names, titles, and host text; visibly disclose truncated output.
- [ ] Validate with `pnpm exec vitest run test/cli.test.ts test/render.test.ts test/render-diff.test.ts test/badge.test.ts`.

Suggested commit: `feat: expose release risk comparison in the CLI`.

### T6 — Add optional PR comparison

**Modify:** `action/action.yml`, `action/scripts/post-results.mjs`, `action/scripts/render.mjs`, `action/scripts/render.d.mts`, `action/README.md`, `test/action-render.test.ts`, `test/render.test.ts`.
**Create:** `test/action-comparison.test.ts`.

- [ ] Add `baseline-report`, optional comparison invocation, diff artifact upload, and status propagation.
- [ ] Preserve existing scan-only inputs and the single-comment marker.
- [ ] Add a recipe for obtaining a baseline from a pinned trusted base revision; explain missing-baseline recovery.
- [ ] Cover no baseline, invalid baseline, profile mismatch, permission-denied commenting, and a threshold-failed scan that still produced a valid report.
- [ ] Keep scan and comparison failure handling distinct; do not publish an invalid report as a success badge.
- [ ] Validate with `pnpm exec vitest run test/action-comparison.test.ts test/action-render.test.ts test/render.test.ts`; run `actionlint` for workflow changes.

Suggested commit: `feat: summarize release risk changes in pull requests`.

### T7 — Validate packaged output and pilot the first milestone

**Modify:** `test/golden.test.ts`, affected `fixtures/*/expected.report.json`, `README.md`, `ROADMAP.md`.
**Create:** `docs/release-risk-pilot.md` and controlled report pairs under `test/fixtures/release-risk/`.

- [ ] Make missing golden files fail ordinary verification; updates require the explicit update command.
- [ ] Run `pnpm test:update-goldens` only after reviewing intended report additions; inspect every resulting diff.
- [ ] Run `pnpm verify` and inspect package contents for new library exports, types, and documentation.
- [ ] Run built CLI help, two controlled fixture scans, diff, validate, and badge through `node bin/dsh-vet.mjs`.
- [ ] Exercise a real package release pair with the same scanner/profile and manually reconcile every reported addition with code evidence.
- [ ] Record one external maintainer's feedback when available; do not mark external adoption complete based on an internal demonstration.
- [ ] Keep implementation completion separate from pilot/adoption status in the roadmap.

Suggested commit: `test: validate release risk review end to end`.

## 6. Follow-on milestones

### M2 — New-risk policy and review exceptions

**Entry gate:** M1 comparison is stable and a pilot shows repeated findings create review noise.
**Likely files:** new `src/policy.ts`, `src/review-exceptions.ts`, `test/policy.test.ts`, `test/review-exceptions.test.ts`; extend CLI, Action, and their tests.

- [ ] Define a separate policy result with pass/fail/unavailable and decision reasons; never modify `VetReport`.
- [ ] Add an opt-in `--fail-on-new` threshold for diff. Additions and matched severity/confidence escalations may breach it; unchanged accepted risks do not.
- [ ] Treat an incomparable baseline as unavailable and non-passing when a policy is requested.
- [ ] Define exceptions with finding identity, reviewed content digest, reason, expiry, and policy revision. No blanket package allowlist in the first version.
- [ ] Load authoritative exceptions from trusted base configuration in CI. PR changes to policy or exceptions require independent review and cannot silently self-approve the same PR.
- [ ] Expire exceptions when their semantic subject or reviewed content changes; do not use whole-release digest changes to invalidate unrelated exceptions unnecessarily.
- [ ] Verify boundary dates with an injected clock; preserve original grade and findings in all outputs.
- [ ] Demonstrate a known risk, a newly introduced risk, a changed accepted subject, and an expired exception in one release-review fixture series.

**Acceptance:** no exception can remove evidence or improve the published grade; new graded risk cannot pass because an unrelated prior finding was accepted. Implementation specification must define threshold and exception precedence before coding.

### M3 — Consumer artifact matching

**Entry gate:** M1 digest formats are stable and a consumer needs to associate reports with installation targets.
**Likely files:** new `src/verify-artifact.ts`, `test/verify-artifact.test.ts`; extend resolver, CLI, exports, and `docs/adopt-marketplace.md`.

- [ ] Implement a separate report-versus-artifact operation using exact archive bytes or the documented analysis-input snapshot, with the digest kind explicit.
- [ ] Return match/mismatch/unavailable; a missing digest is unavailable, not a match. A grade is never evidence of a match.
- [ ] Resolve mutable package references to exact versions and show the resolution before checking applicability.
- [ ] Verify content tampering, a different version, same inputs in a different directory, and incompatible digest kinds.
- [ ] Show source identity separately as unverified unless independently checked.
- [ ] Only add attestation support when a consumer requires it; use existing verification tools and check expected signer/repository/workflow identity as well as signatures.

**Acceptance:** a report for an earlier or modified archive cannot pass exact-artifact verification. A valid attestation is never described as proof that code is harmless.

### M4 — Public calibration and integration kit

**Start:** Establish regression cases during M0/M1; do not wait for M3.
**Likely files:** new `test/calibration.test.ts`, `test/fixtures/calibration/`, `docs/calibration-method.md`, `docs/consumer-conformance.md`; extend `docs/emitters.md`.

- [ ] Create labeled benign/malicious-pattern pairs, transformed code variants, and real false-positive regressions without live secrets or executable remote payloads.
- [ ] Record source/license, expected findings, expected limitations, and rationale for each public case.
- [ ] Publish per-case differences between rule revisions; avoid a single unsupported accuracy percentage.
- [ ] Provide conformance cases for legacy reports, optional extensions, forged summary counts, incomplete coverage, incompatible profiles, and mismatched artifacts.
- [ ] Separate structural emitter conformance from detection-quality evaluation and origin verification in the registry.
- [ ] Package a small consumer example: validate → inspect coverage → verify applicability when supported → render. Unknown states remain visible.
- [ ] Exercise the example with one external maintainer or marketplace. Record objections and resulting contract decisions before formal freeze.

**Acceptance:** a third party can reproduce conformance results with documented commands; every corrected false positive has a regression case. Outreach and public posting require a separate authorized action.

## 7. M1 acceptance matrix

| Scenario | Required result |
| --- | --- |
| Historical v1 report | Valid; coverage unknown; comparison unavailable |
| One selected rule with no finding | Grade semantics preserved; visibly partial; cannot imply complete audit |
| Empty JS target | Existing empty-audit finding retained; partial coverage |
| One file fails parsing | Failed file counted and named; partial coverage |
| Declared entry missing | Explicit unresolved entry; no fabricated reachability |
| Same captured inputs under another root | Same analysis-input digest |
| Changed analyzed byte or package metadata | Different analysis-input digest |
| Only README changes | Archive digest changes; analysis-input digest may remain equal |
| Only source line positions change | No new semantic risk; evidence location may change |
| New host, unchanged C grade | Added host visible in diff and PR summary |
| Low confidence becomes medium | Matched change exposes newly graded risk |
| Different scanner version or rule profile | Incomparable, with exact reason |
| Different package identity | Incomparable unless explicit local subject association applies |
| Partial report versus complete report | No claim that removed findings are fixes |
| Duplicate same-subject observations | Stable counts; no unstable ordinal matching |
| Report includes Markdown metacharacters | Safe, bounded rendering with visible truncation |
| URL contains credentials or tokens | No credential/query values in new observations or identities |
| Configured baseline is missing | Non-zero comparison status; current report preserved |
| Fork PR cannot post a comment | Artifacts and job summary available; no privilege escalation |
| Scan threshold fails after report production | Report uploaded; failure remains visible |

## 8. Verification and release discipline

Use focused suites while developing each task. Before merging each releasable package, run the existing gate:

```sh
pnpm verify
```

This runs typechecking, tests, build, and package generation. For Action/workflow changes also run `actionlint`. Verify the Node 20 and Node 24 CI matrix already configured in `.github/workflows/ci.yml`. Do not substitute a local pass for remote CI evidence.

For M1's built-output smoke check, generate temporary reports outside the audited fixture directories:

```sh
node bin/dsh-vet.mjs --help
node bin/dsh-vet.mjs --json ./fixtures/clean-seams-declared > /tmp/dsh-vet-base.report.json
node bin/dsh-vet.mjs --json ./fixtures/clean-seams-declared > /tmp/dsh-vet-head.report.json
node bin/dsh-vet.mjs validate /tmp/dsh-vet-base.report.json /tmp/dsh-vet-head.report.json
node bin/dsh-vet.mjs diff --json /tmp/dsh-vet-base.report.json /tmp/dsh-vet-head.report.json
node bin/dsh-vet.mjs badge /tmp/dsh-vet-head.report.json
```

Expected after M1: validation succeeds; the same-profile comparison reports no risk changes despite distinct run timestamps; badge includes the appropriate coverage qualification. Use task-specific temporary filenames if these paths already exist. The smoke check supplements the paired-change tests, not replaces them.

Release new context and comparison as additive functionality. Do not mass-regenerate externally published reports. Old reports stay readable and explicitly lack newer guarantees. Retain scan-only Action behavior so consumers can disable comparison without losing existing audits.

## 9. Risks and controls

| Risk | Control |
| --- | --- |
| A grade is mistaken for sufficient coverage | Separate grade from coverage in CLI, Markdown, and badge |
| Identity hashes miss an analyzed input | One captured input manifest; digest regression tests; format version |
| Rules change but comparison claims a plugin regression | Exact scanner/profile matching; rescan both sides |
| Human message changes become false risk additions | Semantic subject identities, not display-string matching |
| Aggregated findings conceal a second risky subject | Per-subject observation identities and counts |
| PR chooses its own clean baseline | Trusted base revision recipe; separate baseline acquisition |
| Exceptions hide new behavior | Content-bound scope, expiry, and immutable original reports |
| New metadata leaks secrets | Safe normalized fields and explicit secret-bearing fixtures |
| Standard extensions grow prematurely | Small optional extension; external feedback before freeze |
| Integration work expands into a platform | No hosted service, installer, runtime guard, or dashboard in this plan |

## 10. Completion and product checkpoints

- [ ] M0: documentation and baseline compatibility verified.
- [ ] M1: all acceptance rows covered; CLI and Action package checks pass.
- [ ] Pilot: one real release pair manually reconciled; record review effort and noisy deltas.
- [ ] External feedback: record at least one maintainer's experience when available.
- [ ] M2 decision: proceed only if trusted-baseline comparison is useful and exception handling solves observed friction.
- [ ] M3 decision: proceed when a report consumer needs artifact applicability checks.
- [ ] M4: calibration cases and conformance examples published through normal review.
- [ ] Existing adoption/freeze goals updated with evidence, without marking outreach as adoption.

Evaluate usefulness through concrete pilot records: changes requiring manual investigation, false additions caused by formatting, time spent locating evidence, and whether the maintainer uses the check on a second release. If pilots show no repeated use, pause additional policy/provenance features and fix the comparison workflow first.

## 11. Plan review record

This document covers the five proposed directions: scan scope, upgrade differences, CI policy, artifact applicability, and public calibration. Near-term work is limited to M0/M1; later milestones have explicit entry and exit gates. No runtime code or public metadata is changed by writing this plan.

Before executing a work package, refresh repository state and expand that package into its exact API definitions and implementation steps. Preserve the constraints and acceptance cases here; changes to grade semantics or compatibility require a separate versioning decision.

Reference documents: `ROADMAP.md`, `docs/dsh-vet-v1.md`, `docs/emitters.md`, `docs/adopt-marketplace.md`, and `action/README.md`.
