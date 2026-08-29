# Roadmap & Development Plan

Trackable plan; check boxes as work lands. Status of the whole document:
**contract draft shipped (v0.0.0 scaffold), v0.1 in planning.**

## Positioning

dsh-vet audits DeepSeek Harness (DSH) plugins **before install**: a static
scanner that emits [`dsh-vet/v1`](docs/dsh-vet-v1.md) reports, plus the open
contract itself. It is the pre-install, static, standard-emitting layer of the
trust stack.

Explicit non-goals — these belong to existing tools and stay theirs:

- runtime blocking / restart gating (`dsh-ankh-guard` territory)
- runtime sentinels (`dsh-plugin-audit` territory)
- ecosystem-wide catalog scoring (`dsh-audit` territory)
- being a marketplace

## v0.1 — Reference scanner + CLI

**Goal:** `npx dsh-vet <specifier>` deterministically audits any
npm-installable DSH plugin and emits a `dsh-vet/v1` report that a careful
engineer would call honest.

### T1 — Target resolution

- [ ] `resolveTarget(specifier)` accepting `npm-package`, `local-path`, `git-repo`
- [ ] npm tarball fetch using registry metadata only; record `version` + `integrity` into `target.resolved`
- [ ] `local-path` mode scans a directory with zero network access

### T2 — Analysis engine

- [ ] acorn-based AST pass over shipped JS (`lib/`, `bin/`), ESM + CJS
- [ ] module graph: entry points → reachable files; unreachable code flagged separately, not ignored
- [ ] capability model: classify Node builtins touched per file (`fs`, `child_process`, `net`/`http`, `worker_threads`, …)

Decisions (recorded here until an `docs/adr/` directory earns its keep):

- **D1 — acorn is the single parsing dependency.** Regex cannot produce
  credible analysis; acorn is small, stable, MIT. Zero-dep purity is a
  liability in a trust tool.
- **D2 — analysis is best-effort static.** Findings that depend on runtime
  values are emitted with `low` confidence by default (they never lower a
  grade — by contract).

### T3 — Rule engine + first rule set

- [ ] rule module interface: `{ id, title, defaultSeverity, defaultConfidence, check(ctx) → findings[] }`
- [ ] `docs/rules/<id>.md` for every shipped rule — a rule without public
  rationale is undisputable, and undisputable rules are how trust tools die
- [ ] v0.1 rule set (12–16 rules across four families):
  - `perm.*` — injected seam inventory vs manifest/README claims; undeclared
    fs writes; subprocess spawn; network clients
  - `dep.*` — install scripts (`preinstall`/`postinstall`); unpinned ranges;
    typosquat proximity to popular `dsh-*` package names
  - `obf.*` — `eval`/`new Function`; dynamic `require`; long encoded string
    literals; charcode chains
  - `egress.*` — outbound endpoints; endpoints reachable from
    secret-adjacent reads (`process.env`, DSH home, credential-like files)
- [ ] severity calibration pass: conservative defaults; uncertain → lower
  severity or `low` confidence, never the reverse

### T4 — CLI + output

- [ ] `dsh-vet <specifier>` human summary: grade, counts, top findings with evidence
- [ ] `--json` emits a `dsh-vet/v1` report via `createReport`
- [ ] exit semantics per spec: `0` on any completed report, non-zero on scanner failure; `--strict` exits `1` on findings ≥ `high` with confidence ≥ `medium`
- [ ] `--rules <ids>` filter and `--fail-on <severity>` override

### T5 — Fixture corpus + determinism

- [ ] `fixtures/`: synthetic clean and offending plugins covering every rule
- [ ] golden-report tests: same fixture → byte-identical report across runs
- [ ] CI scans the fixture corpus on every push; drift fails the build

### T6 — Self-audit & calibration

- [ ] run the scanner on dsh-vet itself and on dsh-searxng; publish both reports under `examples/`
- [ ] sweep ~10 real ecosystem plugins; record results; tune until zero obvious false positives
- [ ] README Install section; publish `0.1.0` to npm

**Definition of done:** every box above checked; deterministic audits of
arbitrary npm DSH plugins; results defensible on 10 real plugins; rule docs
complete; self-audited in public.

## v0.2 — Author-side distribution

**Goal:** plugin authors self-audit in CI and publish their grade.

- [ ] GitHub Action: scan on push/PR, upload report artifact, comment findings on PRs
- [ ] committed `.dsh-vet/report.json` + shields.io endpoint badge
  (**D3 — zero-server badge**: the badge reads a report committed to the
  repo, so its value is auditable through git history; no badge service to
  run or trust)
- [ ] action wired up in this repo and in dsh-searxng
- [ ] npm `0.2.x`

**Definition of done:** action green on two real repos; badges render and
match their reports.

## v0.3 — Ecosystem adoption + contract freeze

**Goal:** the contract outlives the tool.

- [ ] pitch report rendering to 1–2 marketplaces (dshmarket, dsh-hub.cc)
- [ ] incorporate feedback; freeze `dsh-vet/v1`
- [ ] publish a verified third-party emitter checklist and list emitters
- [ ] announcements: reply under
  [deepseek-harness#1115](https://github.com/deepseek-ai/deepseek-harness/discussions/1115),
  a Show Your Plugins post, awesome-list PRs
- [ ] explore a complementary narrative with `dsh-plugin-audit`
  (static report + runtime sentinel)

**Definition of done:** ≥1 marketplace renders `dsh-vet/v1`; ≥1 third-party
emitter verified; contract frozen.

## Cross-cutting disciplines

- **Determinism is a product feature**, not a test detail: sorted findings,
  derived summary, no ambient state beyond `scanner.ranAt`.
- **Conservative severity.** The cost of a false positive (an author's
  reputation) exceeds the cost of a miss (a user reads one more finding).
  Confidence gating in the contract is the backstop, not the excuse.
- **Every rule is disputable in public.** Evidence in the report, rationale
  in `docs/rules/`, corrections in the CHANGELOG — including the embarrassing
  ones.
- **Competitor watch:** `dsh-plugin-audit` (runtime sentinel — complementary),
  `dsh-ankh-guard`, `dsh-audit` (catalog scores). Coordinate where possible;
  never FUD.

## Risks

| Risk | Mitigation |
|---|---|
| A false positive damages a plugin author | confidence gating; conservative defaults; dispute template; public rule-fix log |
| Users read a grade as a "safe" stamp | spec language: signals, not verdicts; grade = worst graded finding, nothing more |
| Scope creep into runtime or marketplace | non-goals above; partnerships instead of features |
| Contract churn after adoption | `/v1` freezes at v0.1; additive-only changes afterwards; `/v2` for semantics |
| Solo-maintainer burnout | v0.1 is the peak; v0.2/v0.3 are incremental; kill criteria below |

## Kill / pivot criteria

If v0.1 ships and, 2–3 weeks later, there are zero references in
#1115-adjacent threads and zero author-side installs: pause scanner
development, maintain the contract and spec only, revisit when the official
marketplace lands. Sunk cost is capped at v0.1.
