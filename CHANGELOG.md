# Changelog

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
