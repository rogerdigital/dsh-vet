# The `x-dsh-vet` scan-context extension, version 1

Status: **defined; the reference scanner does not emit it yet.** This
document is normative for emitters that attach `x-dsh-vet` version 1 and
for consumers that read it. See [dsh-vet-v1.md](dsh-vet-v1.md) for the
base contract this extends.

A base `dsh-vet/v1` report says what was *found*. It says nothing about
what was *checked*: which rules ran, which files the analyzer reached,
what content the findings describe. The optional `x-dsh-vet` extension
records exactly that, so a consumer can tell a complete static audit from
a subset scan and tie a report to the bytes it describes.

## Design rules

1. **Optional and versioned apart.** The extension lives under the
   `x-dsh-vet` key with its own `version` field. Old reports without it
   remain valid forever; missing extension data means **unknown**, never
   full coverage.
2. **Tolerant consumers, strict version 1.** Consumers must ignore unknown
   fields inside the extension. A known `version: 1` payload that violates
   this document is malformed and must not validate. An extension with a
   future integer `version` may still be a valid base report, but its
   context is **unsupported**: never treat it as trusted comparison or
   coverage metadata.
3. **Counts have defined populations.** Every emitted count states what it
   counts. Candidate JavaScript files exclude ignored directories and
   unsupported formats; directory omissions are never reported as
   fabricated file counts.
4. **`complete` is scoped.** Coverage `complete` means *complete within the
   documented static JavaScript scope of the emitting scanner* — never
   complete behavioral analysis and never dependency coverage. Fixed
   limitations are listed even on complete reports.

## Envelope

```jsonc
{
  "schema": "dsh-vet/v1",
  // …base report…
  "x-dsh-vet": {
    "version": 1,
    "profile":     { /* who analyzed, how configured */ },
    "coverage":    { /* what the analysis reached */ },
    "subject":     { /* what content the report describes */ },
    "observations": [ /* stable risk observations */ ],
    "findingIdentities": [ /* stable identities for findings */ ]
  }
}
```

All four areas are required when a version-1 extension is emitted;
`observations` may be an empty array. `findingIdentities` is optional
(vendor rules without identity support omit it).

## `profile`

| Field | Type | Notes |
|---|---|---|
| `analyzerRevision` | `string` | engine identity + revision, e.g. `dsh-vet-analyzer/0.3.0` |
| `ruleCatalogRevision` | `string` | rule catalog identity + revision, e.g. `dsh-vet-rules/0.3.0` |
| `rules` | `string[]` | sorted unique effective rule ids, including automatic checks such as `scan.empty-audit` |
| `options` | `object` | effective scan options as they affected findings; JSON-safe values only |
| `digest` | `string` | `sha256:<64 lowercase hex>` over the canonical JSON of the four fields above |

The profile digest is what makes two scans *comparable*: identical
analyzer, catalog, rule selection, and options produce identical digests.
It is computed as SHA-256 over the canonical JSON encoding (below) of
`{ analyzerRevision, ruleCatalogRevision, rules, options }`.

## `coverage`

| Field | Type | Notes |
|---|---|---|
| `status` | `'complete' \| 'partial' \| 'unknown'` | scanner-asserted; see scoped meaning above |
| `candidateJs` | `integer ≥ 0` | candidate JS files in the documented scope |
| `parsed` | `integer ≥ 0` | candidates the analyzer parsed |
| `parseFailures` | `integer ≥ 0` | candidates that failed parsing; equals `failedFiles.length` |
| `failedFiles` | `string[]` | sorted unique relative paths of parse failures |
| `entries.resolved` | `string[]` | sorted unique declared entry hints found |
| `entries.unresolved` | `string[]` | sorted unique declared entry hints not found |
| `omissions` | `{ reason, path, detail? }[]` | known omissions, sorted by `path` then `reason`, unique on that pair |
| `dependencyMode` | `'not-scanned'` | only value in version 1 |
| `limitations` | `string[]` | sorted unique fixed limitations, listed even when `complete` |

Cross-count invariants: `parsed ≤ candidateJs` and
`parsed + parseFailures ≤ candidateJs` (the gap is what `omissions`
records). A `complete` status additionally requires `candidateJs ≥ 1`,
`parseFailures = 0`, no unresolved entries, and no omissions — anything
else is malformed. `partial` is always safe to assert; an unresolved
entry affects completeness without implying every file went unscanned.

## `subject`

| Field | Type | Notes |
|---|---|---|
| `packageName` | `string?` | package name when the target has one |
| `analysisInputDigest` | `string` | `sha256:<64 hex>`; see below |
| `digestKind` | `'dsh-vet/analysis-input@1'` | identifies the digest semantics |
| `archiveDigest` | `string?` | `sha256:<64 hex>` over exact archive bytes, when an archive was consumed |

Two explicitly different digests — never conflate them:

- **Archive digest** is SHA-256 over the exact downloaded or supplied
  archive bytes. Registry integrity verification stays where it is
  (`target.resolved.integrity`) and remains independent.
- **Analysis-input digest** is SHA-256 over a canonical manifest of the
  exact bytes analysis consumed (including `package.json`): a JSON array
  sorted by relative POSIX path of
  `{ "bytes": <length>, "path": "<relative POSIX>", "sha256": "<file sha256 hex>" }`
  entries, encoded as canonical JSON and hashed. `digestKind` versions
  these semantics; consumers must check it before trusting the digest.

The analysis-input digest is **not** a digest of every packaged file and
must never be labeled full-package integrity: adding a non-analyzed
README preserves it while changing the archive digest. A source directory
and its built npm package are not interchangeable verification targets.

## `observations`

Structured risk observations with stable identities, the basis for
comparing two reports without diffing human titles or snippets.

| Field | Type | Notes |
|---|---|---|
| `kind` | `string` | stable observation kind, e.g. `outbound-host` |
| `file` | `string` | relative path of the observing evidence |
| `subject` | `string` | normalized semantic subject (hostname, capability name, …) |
| `count` | `integer ≥ 1?` | duplicate identical observations as counts; default 1 |

Observation identity is `kind + file + subject`. The array is sorted by
that triple and unique on it. Line numbers, display titles, severity,
confidence, and code formatting are excluded from identity. Canonicalize
hostnames without query strings, credentials, or secret-bearing URL
paths; keep policy-relevant differences such as destination port. Never
emit secret values — prefer safe API names, environment-variable
identifiers, normalized hosts, and hashes. Unsupported identity cases
produce a documented limitation, not a guessed match.

## `findingIdentities`

Optional: stable identities for the report's findings, so two reports
can be compared without diffing human titles or snippets.

| Field | Type | Notes |
|---|---|---|
| `rule` | `string` | rule id of the finding this identity describes |
| `variant` | `string` | rule-defined finding-shape discriminator (single-shape rules use one) |
| `file` | `string` | package-relative path of the subject |
| `subject` | `string` | normalized semantic subject: safe API name, host, dependency, or hash |
| `count` | `integer ≥ 1?` | duplicate identical subjects as counts; default 1 |

Identity is `rule + variant + file + subject`; the array is sorted by
that quad and unique on it. A rule that aggregates several evidence
items exposes one identity per subject, so adding a second endpoint is
detectable even though the finding count does not change. Findings whose
subjects cannot be normalized safely carry no identity — comparison
treats them as unsupported, never as matches. The reference scanner
derives identities from the same analysis facts the rules consumed; a
rule whose identity derivation disagrees with its emitted findings
contributes no identities rather than a guessed alignment.

## Canonical JSON

Both digest computations hash canonical JSON: object keys sorted by
UTF-16 code unit order, no whitespace, `undefined`-valued keys omitted,
non-finite numbers encoded as `null`, one format for strings and integers
(standard `JSON.stringify`). The reference implementation is
`canonicalJson()` in `src/scan-context.ts`; emitters must match it byte
for byte. Array ordering everywhere in this extension is lexicographic by
Unicode code units (plain `<`).

## Validation summary

`dsh-vet validate` rejects a version-1 extension that breaks any of:
enum membership, integer bounds, sort order, uniqueness, the
cross-count invariants, `complete` preconditions, digest syntax, or
profile-digest consistency (the asserted digest must equal the digest
computed from the other profile fields). Unknown fields inside the
extension are tolerated; a future integer `version` is tolerated as a
base report and reported as unsupported context by `checkScanContext()`.

## Example

```json
{
  "version": 1,
  "profile": {
    "analyzerRevision": "dsh-vet-analyzer/0.3.0",
    "ruleCatalogRevision": "dsh-vet-rules/0.3.0",
    "rules": ["dep.postinstall-script", "scan.empty-audit"],
    "options": {},
    "digest": "sha256:5f2a…"
  },
  "coverage": {
    "status": "partial",
    "candidateJs": 3,
    "parsed": 2,
    "parseFailures": 1,
    "failedFiles": ["broken.js"],
    "entries": { "resolved": ["index.js"], "unresolved": [] },
    "omissions": [],
    "dependencyMode": "not-scanned",
    "limitations": ["static analysis of JavaScript sources only"]
  },
  "subject": {
    "packageName": "example-plugin",
    "analysisInputDigest": "sha256:9c1d…",
    "digestKind": "dsh-vet/analysis-input@1"
  },
  "observations": [
    { "kind": "outbound-host", "file": "index.js", "subject": "api.example.com", "count": 1 }
  ],
  "findingIdentities": [
    { "rule": "egress.outbound-endpoints", "variant": "endpoints", "file": "index.js", "subject": "api.example.com" }
  ]
}
```
