# Rendering `dsh-vet/v1` reports in your marketplace

A one-pager for marketplace and catalog maintainers. Short version: your
users currently judge DSH plugins by vibes at install time; a committed
`dsh-vet/v1` report gives you a grade, a findings table, and filters from
one JSON file — with zero servers to run and no endorsement implied.

## Why render reports

- **Demand already exists.** The community's most-upvoted feature request
  ([deepseek-harness#1115](https://github.com/deepseek-ai/deepseek-harness/discussions/1115))
  asks for marketplace standards and review mechanisms. The official
  marketplace will take time.
- **Authors publish reports already.** The
  [GitHub Action](https://github.com/rogerdigital/dsh-vet/tree/main/action)
  audits a plugin on every push and publishes the report + badge to a
  `dsh-vet/report` branch, so for adopting repos the data is a raw-file URL
  away — nothing for you to run.
- **Zero lock-in.** The contract is additive-only, consumers must ignore
  unknown fields, and the grade ships inside the report — you render it, you
  never recompute it. Dropping the integration later loses a column, not
  your site.
- **Display is not endorsement.** Reports are signals, not verdicts; the
  spec says so, and the badge says so. You surface what the audit found.

## Three integration paths

**1. The badge (minutes).** Render a shields.io badge from a report:

```sh
npx dsh-vet badge <report.json>   # → shields endpoint JSON
```

**2. The findings table (an hour).** Import the reference renderer — the
same one the GitHub Action uses for PR comments:

```ts
import { renderMarkdown, validateReport } from 'dsh-vet'

const report = await fetch(reportUrl).then((r) => r.json())
const { ok } = validateReport(report)      // never trust an unverified emitter
if (ok) page.add(renderMarkdown(report, { runUrl: reportUrl }))
```

**3. Ingestion-time validation (for pipelines).** Reject malformed or
forged reports before they reach your UI — the validator recomputes the
grade from the findings, so an emitter cannot assert a grade its evidence
does not support:

```sh
npx dsh-vet validate report.json && echo trustworthy-shape
```

## Consumer rules (from the spec)

- **Ignore unknown fields** — emitters may add `x-`-prefixed extras; tolerate
  them.
- **Read `summary.grade`; never recompute it.** Grades are derived at emit
  time by contract.
- **Never present grade `X`** as a plugin's grade — it marks an incomplete
  scan.
- **List findings, don't re-score them.** Severity and confidence are part
  of the data; a low-confidence finding never lowers a grade, by contract.

## Where reports come from

Plugin authors commit them via the [Action](https://github.com/rogerdigital/dsh-vet/tree/main/action)
(`dsh-vet/report` branch in their repo), or you can run the scanner yourself
on any npm-installable plugin: `npx dsh-vet --json <specifier>`. Emitters
you didn't write must pass `dsh-vet validate` first; verified emitters are
listed in [emitters.md](emitters.md).

The contract itself: [dsh-vet-v1.md](dsh-vet-v1.md) — stable, additive-only
since 0.1.0, freezing after this adoption round. Feedback on it is exactly
what the freeze round is for: [discussions](https://github.com/rogerdigital/dsh-vet/discussions).
