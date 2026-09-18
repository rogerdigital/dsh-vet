# Calibration method and public corpus

How dsh-vet's detection behavior is measured in public, and how anyone
can reproduce the measurement. Companions:
[`consumer-conformance.md`](consumer-conformance.md) (structural
guarantees) and [`calibration-v0.1.md`](calibration-v0.1.md) (the original
ecosystem sweep against real packages).

## Principles

1. **Cases are pairs, not scores.** Every case states what must fire and
   what must not, with the reasoning attached. There is deliberately no
   aggregate accuracy percentage: one number over a corpus this size
   would claim precision the data cannot support.
2. **Benign cases cost more than detection cases.** A miss is a future
   incident; a false positive is an author's damaged grade today. Both
   sides are locked; tuning resolves toward the author.
3. **Every corrected false positive gets a regression case.** A tuning
   without a locked case can silently regress — the acceptance bar for
   this corpus is that no past correction can disappear unnoticed.
4. **No live secrets, no executable remote payloads.** Corpus fixtures
   are synthetic shapes: hosts sit under `*.example.com`, charcode chains
   decode to inert prefixes, encoded literals decode to nothing runnable.

## The corpus

`test/fixtures/calibration/<case>/` — a scannable mini-package plus a
`case.json` manifest (kind, source, license, `since`, expectations,
rationale, limitations). `test/calibration.test.ts` scans every case on
every run and fails on any disagreement with the manifest.

| Case | Kind | Since | Locked behavior |
|---|---|---|---|
| `benign-hex-palette` | benign | 0.1.0 | repeated-digit hex tables stay silent (`obf.encoded-payload` forbidden), grade A |
| `detection-hex-payload` | detection | 0.1.0 | high-diversity hex fires `obf.encoded-payload`; low confidence keeps grade A |
| `detection-charcode-host` | detection | 0.1.0 | `String.fromCharCode` chain fires `obf.charcode-chain`, grade C |
| `detection-env-exfil` | detection | 0.1.0 | undeclared fetch + `process.env` read: network-client, outbound-endpoints, secret-adjacent; proven reachability from the secret read escalates the grade to D |
| `transform-format-base` / `-variant` | transform pair | 0.4.0 | reformatting and line moves produce a comparable diff with zero risk deltas |
| `regression-imports-map` | regression | unreleased | files reached through the `#` imports map (node condition) are reachable; only `default`-only siblings stay unreachable, grade A |
| `detection-empty-js` | detection | 0.2.1 | zero-JS directory audits nothing: `scan.empty-audit` fires, grade C |

## Reproducing

From a checkout:

```sh
pnpm install
pnpm exec vitest run test/calibration.test.ts
```

Against any released scanner version, no checkout needed — clone or
download this directory and scan a case directly, then compare against
the manifest:

```sh
npx dsh-vet@0.4.0 --json test/fixtures/calibration/detection-charcode-host
```

## Revision record

When a rule change alters a corpus outcome: bump the manifest's `since`,
and append a row here. This table — per-case, dated, reasoned — is the
published accuracy claim; nothing summarizes it into one number.

| Date | Scanner | Case | Before | After | Reason |
|---|---|---|---|---|---|
| 2026-08-30 | 0.1.0 | benign-hex-palette | `obf.encoded-payload` fired on palette strings | silent | palette false positive on `dsh-better-sidebar@0.17.1`; hex threshold raised to ≥ 8 distinct characters (calibration-v0.1, tuning 1) |
| 2026-09-11 | unreleased | regression-imports-map | imports-map-only files flagged unreachable | reachable | chalk@5.3.0 pilot surfaced the gap; analyzer now resolves `#` specifiers through the imports map (docs/release-risk-pilot.md) |

At each release, replace any `unreleased` `since` value with the shipping
version and update the matching row here — the release review checks this.
