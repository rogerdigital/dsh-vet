# Release-risk review pilot (M1)

Status: **internal pilot complete; external feedback pending.** This page
records how the first milestone was exercised and what the comparison
showed on real release pairs. It is not an adoption claim — no external
maintainer has used the workflow yet, and the M2 entry gate (repeated
pilot use showing review friction) is not met.

## What was exercised

| Exercise | Result |
|---|---|
| Controlled pair (committed fixtures, one added host) | Comparable; exactly the added-host identities and observation; grades equal |
| Built-output smoke (`node bin/dsh-vet.mjs`, section 8 of the plan) | Help, scan ×2, validate ×2, diff, badge all pass; same-profile comparison of two runs reports zero risk changes despite distinct `ranAt`; badge unqualified for complete coverage |
| `left-pad@1.2.0` → `1.3.0` | Comparable, zero added/removed/changed — reconciled below |
| `chalk@4.1.2` → `5.3.0` | Comparable, two added `perm.unreachable-files` identities — reconciled below |

All pairs were scanned with the same scanner build and full rule profile;
both sides validated with `dsh-vet validate` before comparison.

## Reconciliation: left-pad 1.2.0 → 1.3.0

Both versions: identical audited behavior. The five unchanged identities
cover the benchmark/test files that ship unreachably (`perf/*`, `test.js`)
and the hex table in `perf/perf.js` (`obf.encoded-payload`, matched by
content hash) — all present in both versions, none moved. **Zero
additions to reconcile; the release changed padding internals without
touching any audited behavior.** Effort: under a minute; the diff
answered "anything new to review?" with a definite no.

## Reconciliation: chalk 4.1.2 → 5.3.0

Reported additions, each verified against the shipped tarballs:

1. `perm.unreachable-files` · `source/vendor/supports-color/index.js`
2. `perm.unreachable-files` · `source/vendor/supports-color/browser.js`

Code evidence:

- 4.1.2 has no `source/vendor/` directory at all; 5.3.0 vendors its
  dependencies there.
- 5.3.0's `source/index.js` imports `#supports-color`, which resolves
  through the package.json `imports` map to exactly those two files
  (`node` → `index.js`, `default` → `browser.js`).
- The reference analyzer resolves relative imports but not `#`-prefixed
  subpath imports, so neither file is statically reachable from the
  declared entry — the finding text ("no static import path from any
  entry point reaches this file") is accurate for this analyzer.
- The sibling vendored `ansi-styles` **is** imported relatively
  (`'./vendor/ansi-styles/index.js'`), is reachable, and is correctly
  **not** reported — the delta is per-subject, not per-directory.

Both grades stay `A` (unreachable files are informational); the delta is
visible precisely because observations and identities are reported even
when grades do not move.

Honest limitation observed: `#`-subpath `imports` maps are not resolved,
so code reached only through them reads as unreachable. That is a
documented analyzer gap to close in a later revision — visible here
because the delta surfaces it, which is the point of the workflow.

## Pilot observations

- The two real pairs took minutes to reconcile; every reported addition
  mapped to a code fact, no formatting-driven false additions appeared
  (line movement is excluded from identity by design and it held).
- The interesting noise class is informational unreachable-file churn on
  refactors that vendor or move code — visible, cheap to dismiss, and
  exactly what M2's exception mechanism would absorb if it repeats.
- One pilot round is not enough to justify policy work. The M2 entry
  gate stays closed until a maintainer uses the comparison on real
  releases repeatedly and reports the friction.

## External feedback (pending)

No external maintainer has used the comparison yet — this section stays
empty until one does, and a friendly reply is not adoption. The ask and
its per-plugin pre-run results live in
[`docs/outreach/release-risk-pilot-ask.md`](outreach/release-risk-pilot-ask.md);
record each thread here as it happens.

Intake questions (mirroring the plan's §10 usefulness criteria):

1. Does the reported delta match what the author intended to change?
2. Anything the scanner missed or got wrong?
3. Any entries that felt like noise?
4. Would they read it on their PRs — and did they run it on a *second*
   release? (The repeated-use answer is the M2 entry gate.)

| Date | Plugin | Thread | Verdict (used / not / second release) |
|---|---|---|---|
| 2026-09-11 | dsh-doctor | [astra3294/dsh-doctor#9](https://github.com/astra3294/dsh-doctor/issues/9) | pending |
| 2026-09-11 | dsh-wechat | [pan17/dsh-wechat#7](https://github.com/pan17/dsh-wechat/issues/7) | pending |
| 2026-09-11 | dsh-find-plugin | [awesome-dsh-plugin/dsh-find-plugin#11](https://github.com/awesome-dsh-plugin/dsh-find-plugin/issues/11) | pending |

The announcement follow-up went out after 0.4.0 shipped:
[deepseek-harness#1115](https://github.com/deepseek-ai/deepseek-harness/discussions/1115#discussioncomment-18402967).

## Reproduction

```sh
pnpm build
node bin/dsh-vet.mjs --json left-pad@1.2.0 > /tmp/lp-base.json
node bin/dsh-vet.mjs --json left-pad@1.3.0 > /tmp/lp-head.json
node bin/dsh-vet.mjs validate /tmp/lp-base.json /tmp/lp-head.json
node bin/dsh-vet.mjs diff --json /tmp/lp-base.json /tmp/lp-head.json

node bin/dsh-vet.mjs --json chalk@4.1.2 > /tmp/ch-base.json
node bin/dsh-vet.mjs --json chalk@5.3.0 > /tmp/ch-head.json
node bin/dsh-vet.mjs diff --json /tmp/ch-base.json /tmp/ch-head.json
```

The controlled pair lives in `test/fixtures/release-risk/` and is
asserted by `test/golden.test.ts` on every run.
