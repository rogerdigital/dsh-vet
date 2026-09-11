# The `dsh-vet/diff/v1` comparison result

Status: **defined; the reference CLI exposes it from the next release.**
This document is normative for consumers of `compareReports()` and the
`dsh-vet diff` output. See [dsh-vet-v1.md](dsh-vet-v1.md) for the base
report and [scan-context-v1.md](scan-context-v1.md) for the extension the
comparator reads.

`compareReports(base, head)` is pure data in, pure data out: it never
fetches packages, never mutates either report, and never recalculates a
report under new rules. It compares what two validated reports actually
recorded.

## Comparability

A pair is **comparable** only when every gate passes:

| Gate | Reason code when it fails |
|---|---|
| Both are structurally valid `dsh-vet/v1` reports | `report-invalid-base` / `report-invalid-head` |
| Both carry a validated version-1 `x-dsh-vet` context | `context-absent-*`, `context-unsupported-*`, `context-invalid-*` |
| Both carry finding identities | `identities-absent-base` / `identities-absent-head` |
| Same scanner name and version | `scanner-mismatch` |
| Same profile digest (analyzer, catalog, rules, options) | `profile-mismatch` |
| Same package identity, or an explicit shared subject label | `subject-mismatch` / `subject-unlabeled` |
| Neither side graded `X` | `grade-x-base` / `grade-x-head` |
| Complete coverage on both sides | `coverage-partial-base` / `coverage-partial-head` |

An incomparable result carries the reason codes and both report
references, and **no change collections** — an absent diff must never
read as "nothing changed". There is no force-comparison switch in M1;
when practical, rescan both artifacts with the same scanner and profile
instead. Two local-directory scans without package identity compare only
under an explicit `subjectLabel` option; identity is never inferred from
temporary absolute paths. Different analysis-input or archive digests
are expected and never block comparison.

## Result shape

```jsonc
{
  "schema": "dsh-vet/diff/v1",
  "base": { "scanner": { /* name, version, ranAt */ }, "grade": "C", "subject": { /* … */ } },
  "head":  { "scanner": { /* … */ }, "grade": "C", "subject": { /* … */ } },
  "comparability": "comparable",
  "reasons": [],
  "findings": {
    "added":    [ /* identities present only in head */ ],
    "removed":  [ /* identities present only in base */ ],
    "changed":  [ /* matched identities that moved; both sides recorded */ ],
    "unchanged": [ /* matched and identical */ ]
  },
  "observations": {
    "added": [], "removed": [], "countChanged": [], "unchanged": []
  }
}
```

Identity entries and observations are the extension's own objects
(`rule`/`variant`/`file`/`subject`/`finding`/`count?` and
`kind`/`file`/`subject`/`count?`). Every collection is sorted and
deterministic: two comparisons of the same pair produce byte-identical
results.

A **changed** finding records both sides' severity, confidence, and
count. Severity and confidence transitions are classified separately
from additions on purpose: moving from `low` to `medium` confidence can
introduce a graded risk at unchanged severity.

## Reading the result honestly

- `added` means newly observed under the same checks — not proof of new
  malice, and not a grade change by itself.
- `removed` means no longer observed under comparable checks — never a
  claim that anything was fixed.
- Observation deltas are visible even when grades are identical or the
  observations are informational; an unchanged grade never hides new
  behavior.
- The comparator reports line-position changes as nothing: identities
  exclude line numbers, so a line insertion is not a risk addition.
