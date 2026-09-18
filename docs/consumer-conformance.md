# Consumer conformance: what a report proves, and how to check one

For marketplaces, installers, and CI jobs that receive `dsh-vet/v1`
reports from scanners they did not write.

## The workflow

validate → inspect coverage → applicability → render.
[`examples/consumer/consume-report.mjs`](../examples/consumer/consume-report.mjs)
is the whole workflow in one file:

```sh
node examples/consumer/consume-report.mjs report.json https://your.run/url
```

Unknown states stay visible: a report without the extension reads
`coverage unknown`, never complete; a report that fails validation
renders nothing. Note that validation failure does not erase extension
data — a forged summary over an intact, internally consistent `x-dsh-vet`
still reports its coverage status, which is itself worth reading.

## What validation proves — and what it never will

`dsh-vet validate` proves **structure**: field types, enums, rule-id
shape, evidence presence, RFC 3339 timestamps, the deterministic sort,
and — the load-bearing check — the derived summary, where grade and
counts are recomputed from the findings, so a report cannot assert a
grade its evidence does not support.

It cannot detect **omitted findings** (a dishonest emitter simply ships
fewer), **origin** (who actually ran the scanner), or **applicability**
(whether the report describes the artifact in front of you). Those are
separate claims, tracked separately in the [emitter registry](emitters.md).

## Conformance cases

`test/fixtures/conformance/` — committed reports, each locked by
`test/conformance.test.ts`:

| File | Locked behavior |
|---|---|
| `legacy-minimal.report.json` | valid without the extension; coverage unknown; never comparison metadata |
| `extension-v1.report.json` | valid with `x-dsh-vet` v1; coverage complete; renders with coverage stated |
| `partial-coverage.report.json` | valid but visibly partial; cannot stand comparison against a complete report |
| `forged-summary.report.json` | asserted grade rejected — the summary is derived, never asserted |
| `future-extension.report.json` | a v2 context stays a valid base report; reported unsupported; never trusted |
| `pair-a-base/head.report.json` | same profile, different `ranAt`: comparable, zero deltas |
| `pair-b-head.report.json` | subset rule profile: incomparable, reason `profile-mismatch` |

Reproduce against any released version, no checkout needed:

```sh
npx dsh-vet@0.4.0 validate test/fixtures/conformance/extension-v1.report.json
npx dsh-vet@0.4.0 diff --json test/fixtures/conformance/pair-a-base.report.json test/fixtures/conformance/pair-a-head.report.json
```

The committed files regenerate with
`pnpm build && node scripts/gen-conformance-fixtures.mjs` — review the
diff; these files are the kit.

## Applicability (not yet supported)

Matching a report to the artifact you are about to install ships behind
its own milestone, gated on a real consumer needing it. Until then the
consumer example says so explicitly on every run, and no grade is ever
evidence of a match.
