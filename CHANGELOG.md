# Changelog

## 0.4.0

- **New: every report records what the scan actually covered — the
  `x-dsh-vet` scan-context extension, version 1.** Rule profile (analyzer
  and catalog revisions, sorted effective rule ids including the automatic
  empty-audit check, a derived profile digest), coverage (candidate/parsed/
  failed counts with named files, resolved and unresolved entry hints,
  known omissions, fixed limitations), content identity (an
  analysis-input manifest digest over the exact bytes analysis consumed,
  plus the exact archive digest for registry-resolved packages), and
  stable finding identities. Spec: `docs/scan-context-v1.md`. Old reports
  without the extension stay valid; consumers must read missing coverage
  as *unknown*, never complete — the CLI, PR comments, and badges now say
  so (`grade C · coverage: partial`, `grade A (coverage unknown)`).
- **New: `dsh-vet diff` — compare two reports, release-review style.**
  Produces `dsh-vet/diff/v1`: added / removed / changed findings matched
  by stable identity (rule + variant + file + subject), behavior
  observation deltas, and both sides of every severity / confidence /
  count transition. Line moves and reformatting are not risk additions; a
  second endpoint is. Two reports that cannot be honestly compared (scan-
  ner, profile, subject-identity, coverage, or grade-X mismatches) return
  `incomparable` with explicit reason codes instead of a diff that would
  read as "nothing changed". Exit 0 comparable / 1 incomparable / 2 usage
  or invalid reports. Also exported as `compareReports()`. Spec:
  `docs/report-diff-v1.md`.
- **New: optional `baseline-report` Action input** — PRs get a bounded,
  escaped "what changed since the base revision" section in the comment
  and job summary, with the full diff uploaded as an artifact. The
  baseline must come from a trusted base revision; the action README
  documents the merge-base recipe and the trust boundary.
- Grading, rules, and report semantics unchanged — the extension is
  additive; all previously valid reports still validate.

## 0.3.0

- **New: `dsh-vet validate <report.json>` — the contract conformance gate
  for consumers and emitters.** A marketplace or CI job receiving reports
  from scanners it did not write can now check them against the contract
  instead of trusting the emitter: field types, enums, rule-id shape,
  evidence presence, RFC 3339 timestamps, and — the load-bearing check —
  the derived summary, where the grade and counts are recomputed from the
  findings, so a report cannot assert a grade its evidence does not
  support. Unknown fields are ignored (design rule 4). The corpus test
  proves every report ever committed here still validates, including those
  emitted by scanner 0.1.0. Also exported as `validateReport()` from the
  package.
- **New: `renderMarkdown()` exported from the package** — the reference
  findings/grade rendering (the same markdown the GitHub Action posts on
  PRs), so marketplaces and integrations render reports without
  reimplementing it. `action/scripts/render.mjs` keeps its dependency-free
  copy (the composite action must not depend on the installed scanner
  version); a cross-check test asserts the two stay identical.
- **v0.3 ecosystem groundwork:** verified-emitter checklist and registry
  (`docs/emitters.md`), marketplace adoption one-pager
  (`docs/adopt-marketplace.md`), and ready-to-send announcement drafts
  (`docs/outreach/`).
- **Contract status reconciled.** The spec header still said *draft* while
  the README said *frozen* and the roadmap scheduled the freeze for v0.3 —
  three stories in circulation. All three now say the same thing: stable,
  additive-only since 0.1.0, formal freeze after the v0.3 feedback round.
- No scanner behavior change.

## 0.2.6

- **Breaking (action): the badge now lives on the `dsh-vet/report` branch.**
  The PR-based publish path was architecturally incompatible with
  GITHUB_TOKEN: workflows on Actions-created PRs require per-PR human
  approval (`action_required`), so required checks can never pass and
  auto-merge can never fire — found live after enabling PR creation.
  The branch-based design needs no PR, no checks, and no repository
  settings: the audit force-publishes report + badge to the unprotected
  `dsh-vet/report` branch, shields.io reads it, and the branch history
  remains the D3 audit trail. Badge URLs change from `main` to
  `dsh-vet/report`. The default branch no longer carries `.dsh-vet/`.
- Dedup compares against the branch tip (reports differing only by
  `scanner.ranAt` are not republished).
- No scanner behavior change.
## 0.2.5

- Action: the badge-update branch pushes with `--force` instead of
  `--force-with-lease`. The lease rejected pushes as "stale info"
  whenever `dsh-vet/report` survived remotely (an unmerged PR or a
  racing run) while the runner's shallow checkout had never fetched it —
  a disposable bot branch rebuilt from main on every run needs no lease.
- No scanner behavior change.
## 0.2.4

- Action: the badge-update PR now actually gets created and auto-merged.
  Two live-caught bugs: `gh pr merge --auto` without an explicit merge
  method prints usage and fails, and the original chain swallowed every
  error (`2>/dev/null ... || true`), leaving a pushed branch with no PR
  and no signal. Creation is now idempotent and loud; auto-merge failure
  degrades to a visible warning with the PR awaiting manual merge.
- No scanner behavior change.
## 0.2.3

- Action: `commit-report` now publishes through an **auto-merged PR**
  instead of a direct push to the default branch — protected branches
  (required status checks) reject direct pushes, which broke the badge
  refresh the moment branch protection was enabled (GH013). Reports that
  differ only by `scanner.ranAt` are not published, so a badge changes
  only when the audit result changes — no PR per push. The [skip ci]
  marker is gone: it would have skipped the PR's required checks.
- This repo's audit job self-hosts the working-tree action (`uses:
  ./action`) so self-auditing never lags a release behind the repo.
- No scanner behavior change; the contract is unchanged.
## 0.2.2

- `perm.undeclared-fs-write`: the runtime-value tier no longer asserts the
  target is "outside any plausible plugin scope" — a claim a static scanner
  cannot make about a dynamic path. It now reports "scope not statically
  verifiable" at low/low (review prompt, never grade-affecting). Literal
  out-of-scope writes keep high/critical. Clarified via false-positive
  dispute [#10](https://github.com/rogerdigital/dsh-vet/issues/10), whose
  guarded managed-directory removal was verified against source and tests
  before the rule changed.

## 0.2.1

- New rule `scan.empty-audit` (medium/high): a scan that found zero
  analyzable JavaScript files reports it instead of grading A by vacuity.
  Found live during v0.2 activation — a TypeScript source tree scanned as a
  local path audits nothing while the badge reads green.

## 0.2.0

Author-side distribution (ROADMAP v0.2): plugin authors self-audit in CI
and publish their grade.

- `dsh-vet badge <report.json>` renders a shields.io endpoint badge from a
  dsh-vet/v1 report (grade → color; `X` marks a failed scan).
- GitHub Action under `action/` (composite, fully readable): pinned scanner
  from npm, report artifact on every run, edited-in-place PR findings
  comment, and optional commit of `.dsh-vet/report.json` + `badge.json` on
  the default branch — the zero-server badge (D3).
- README CI & badge documentation; `action/README.md` with inputs and badge
  snippets.

## 0.1.0

First scanner release. The `dsh-vet/v1` report contract (draft since the
repository bootstrap) now has a reference implementation.

- `resolveTarget`: npm packages via registry metadata only, tarballs verified
  against `dist.integrity` before extraction; local paths with zero network;
  git repos via depth-1 clone. Extraction is a hand-rolled ustar/PAX reader
  with path-traversal guards (ROADMAP D4).
- Analysis engine: acorn AST pass (ESM + CJS fallback), module graph from
  `main`/`module`/`exports`/`bin` with unreachable files tracked separately,
  per-file capability model, obfuscation signal collection.
- 15 rules across `perm.*` / `dep.*` / `obf.*` / `egress.*`, each with a
  public rationale in `docs/rules/`. Conservative calibration: findings that
  depend on runtime values default to `low` confidence (D2); seam
  declarations read from `dsh.seams` (D5).
- CLI: human summary, `--json` reports, exit `0` on any completed report,
  `--strict` / `--fail-on` thresholds, `--rules` filter.
- Fixture corpus covering every rule with byte-identical golden-report
  tests; CI scans the corpus on every push.
- Calibration: 11-package ecosystem sweep recorded in
  `docs/calibration-v0.1.md`; hex-payload diversity floor and an all-real
  typosquat name list came out of it.
- Self-audit: `examples/dsh-vet.report.json` is generated from the exact
  tarball that ships.
