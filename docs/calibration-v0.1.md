# v0.1 calibration sweep

ROADMAP T6 requires a sweep of ~10 real ecosystem plugins with tuning until
zero **obvious** false positives. Swept on 2026-08-30 with scanner 0.1.0;
reports are committed under [`examples/sweep/`](../examples/sweep).

## Packages

| Package | Grade | Graded findings |
|---|---|---|
| `dsh-searxng@0.1.1` | C | network-client (no `web` seam declared) |
| `@linxin666/dsh-doctor@0.3.6` | C | secret-adjacent¹, network-client, subprocess-spawn, undeclared-fs-write¹ |
| `dsh-zcf@0.5.3` | C | secret-adjacent¹, network-client, subprocess-spawn, undeclared-fs-write¹ |
| `@mlgbnb/dsh-archive-manager@1.0.7` | C | network-client, undeclared-fs-write¹ |
| `@michengai/dsh-skills-manager@0.1.30` | C | network-client, undeclared-fs-write¹ |
| `dsh-wechat@0.7.2` | C | network-client, undeclared-fs-write¹ |
| `dsh-find-plugin@0.3.7` | C | network-client |
| `dsh-better-sidebar@0.17.1` | C | secret-adjacent¹, encoded-payload¹, network-client, subprocess-spawn, undeclared-fs-write¹ |
| `@linxin666/dsh-live-stats@0.1.20` | A | — |
| `@aiwayds/dsh-tui-pi@1.1.0` | C | secret-adjacent¹, network-client, subprocess-spawn, undeclared-fs-write¹ |
| `dsh-fabric-host@0.1.11` | A | — |

¹ Emitted at `low` confidence (or includes only low-confidence parts) —
reported, never grade-affecting, per the contract.

Every capability finding was hand-checked against the package's code; every
one describes real code shape. No scanner failures, no criticals.

## What the sweep says about the ecosystem

- No swept package declares `dsh.seams` yet (the vocabulary ships with
  dsh-vet), so honest plugins that legitimately use the network or spawn
  processes read as C until they declare. That is the designed adoption
  path, not a defect: the remediation in each finding is "declare the seam
  or drop the capability".
- Bundled web UIs put `process.env` reads and `fetch` in one file; the
  `egress.secret-adjacent` finding fires at `low` confidence there — signal,
  not verdict, exactly as documented.

## Tuning performed

1. **`obf.encoded-payload`: hex literals now require ≥ 8 distinct
   characters.** `dsh-better-sidebar`'s repeated-digit palette strings
   (`8888…`) are tables, not encodings; encoded payloads use the hex
   alphabet broadly. This removed 2 of 3 findings on that package.
2. **`dep.typosquat-proximity`: popular-name list verified against npm.**
   `dsh-ankh-guard` was removed (not installable — a name that cannot be
   installed cannot be typosquatted); verified-active names were added
   (`dsh-zcf`, `dsh-wechat`, `dsh-better-sidebar`, `dsh-find-plugin`). The
   list is now all-real by construction and re-checked each sweep.

## Accepted residuals

- One 60-char high-diversity hex literal in `dsh-better-sidebar`
  (`4e79a7…` — concatenated d3 category colors). Indistinguishable from a
  real encoding by charset statistics; stays as a medium/**low** finding.
- Typosquat distance-2 findings remain possible on short names; they emit
  at `low` severity and cannot lower a grade.
