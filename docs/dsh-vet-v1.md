# The `dsh-vet/v1` report contract

Status: **stable — additive-only since v0.1.0.** Every report the 0.1.0
reference scanner emitted still validates today. The formal freeze is
announced with v0.3, after the marketplace-feedback round; until then,
changes are limited to new optional fields and new rule ids.
Reference TypeScript types: `src/contract.ts` (shipped from this package).
Conformance checking: `dsh-vet validate <report.json>`.

`dsh-vet/v1` defines a machine-readable audit report for a DeepSeek Harness
(DSH) plugin. It is implementation-agnostic: any scanner may emit it, and any
marketplace, CI job, or UI may consume it. It follows the community pattern
proven by `dsh-doctor/v1`: freeze a small, boring contract first, compete on
implementations.

## Design rules

1. **Findings are signals, not verdicts.** A report describes what code does.
   It does not assert maliciousness, and it never names intent.
2. **Confidence gates severity.** Only findings with confidence `medium` or
   `high` may lower a grade. A `low`-confidence finding is reported but cannot
   cost the audited plugin a grade — false positives must not damage authors.
3. **Reports are deterministic.** `findings` are sorted (worst severity
   first, then rule id ascending); `summary` is always derived from
   `findings`, never asserted by the emitter. Two runs over the same artifact
   with the same scanner version produce byte-identical reports (timestamps
   aside).
4. **Consumers must ignore unknown fields.** Emitters may attach extra fields
   (encouraged to prefix them `x-`); consumers must tolerate them. Emitters
   must not change the meaning of fields defined here.

## Report envelope

```jsonc
{
  "schema": "dsh-vet/v1",          // literal; required
  "target":   { /* what was audited */ },
  "scanner":  { /* who audited, when */ },
  "summary":  { /* derived grade + counts */ },
  "findings": [ /* zero or more findings, sorted */ }
}
```

### `target`

| Field | Type | Notes |
|---|---|---|
| `kind` | `'npm-package' \| 'git-repo' \| 'local-path'` | |
| `specifier` | `string` | e.g. `dsh-vault@1.10.6`, a git URL, or a path |
| `resolved.version` | `string?` | version actually audited |
| `resolved.commit` | `string?` | for `git-repo` targets |
| `resolved.integrity` | `string?` | subresource integrity of the exact artifact scanned, when available |

### `scanner`

| Field | Type | Notes |
|---|---|---|
| `name` | `string` | emitting implementation, e.g. `dsh-vet` |
| `version` | `string` | its version |
| `ranAt` | `string` | RFC 3339 timestamp of the run |

### `finding`

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | rule id; see below |
| `title` | `string` | one line, human |
| `severity` | `'critical' \| 'high' \| 'medium' \| 'low' \| 'info'` | |
| `confidence` | `'high' \| 'medium' \| 'low'` | |
| `evidence` | `VetEvidence[]` | at least one item |
| `remediation` | `string?` | how to make the finding go away |
| `references` | `string[]?` | URLs to rule documentation |

`VetEvidence` = `{ file, line?, snippet?, note? }`. Snippets must be minimal
and must never include secrets.

#### Severity definitions

- **critical** — direct credential/secret exfiltration, code execution during
  install, or destructive filesystem operations outside any declared scope
- **high** — capability that contradicts the plugin's declared purpose
  (undeclared broad fs/shell/net), obfuscated payloads, obvious typosquat
- **medium** — suspicious-but-explainable egress, `eval` of non-literal
  input, install scripts without evident need
- **low** — hygiene: unpinned dependencies, missing license, unscoped
  permissions in the manifest
- **info** — purely informational; never affects the grade

### Rule ids

Pattern: `^[a-z0-9-]+(\.[a-z0-9-]+)+$` — two or more dot-separated lowercase
segments. Reference rules use two segments (`perm.broad-fs-write`,
`dep.postinstall-script`); third-party rule sets prefix their own vendor
segment (`acme.eval-detect`). The pattern is deliberately open-ended about
segment count: a closed single-segment pattern is exactly how `dsh-doctor/v1`
initially broke vendor-prefixed check ids — do not repeat that.

### `summary`

`counts` = per-severity finding totals. `grade` is derived:

| Grade | Condition (over findings with confidence ≥ `medium`) |
|---|---|
| `A` | none, or only `info`/`low`-severity findings |
| `B` | worst graded finding is `low` |
| `C` | worst graded finding is `medium` |
| `D` | worst graded finding is `high` |
| `F` | at least one `critical` |
| `X` | scan incomplete or errored — never presented as the plugin's grade |

## CLI recommendations (non-normative)

Emitters that ship a CLI should exit `0` whenever a report was produced —
findings are data, not failures — and non-zero only on scanner failure.
A `--strict` flag may exit `1` when findings of severity ≥ `high` with
confidence ≥ `medium` exist, for CI gating.

## Example

```json
{
  "schema": "dsh-vet/v1",
  "target": {
    "kind": "npm-package",
    "specifier": "fixture-plugin@1.2.3",
    "resolved": { "version": "1.2.3", "integrity": "sha512-…" }
  },
  "scanner": { "name": "dsh-vet", "version": "0.1.0", "ranAt": "2026-09-01T00:00:00Z" },
  "summary": { "grade": "C", "counts": { "critical": 0, "high": 0, "medium": 1, "low": 1, "info": 1 } },
  "findings": [
    {
      "id": "egress.endpoint-reach",
      "title": "Sends data to an endpoint from code that can read the DSH home directory",
      "severity": "medium",
      "confidence": "high",
      "evidence": [{ "file": "host-half.js", "line": 42, "note": "fetch to https://example.example/collect" }],
      "remediation": "Document the endpoint and what is sent, or remove the call."
    },
    {
      "id": "dep.unpinned",
      "title": "Dependency ranges are not pinned",
      "severity": "low",
      "confidence": "medium",
      "evidence": [{ "file": "package.json" }]
    },
    {
      "id": "meta.no-license",
      "title": "No license field",
      "severity": "info",
      "confidence": "high",
      "evidence": [{ "file": "package.json" }]
    }
  ]
}
```

## Versioning

`/v1` has been additive-only since the v0.1 release of this package — new
optional fields and new rule ids stay in `/v1`; semantic changes get `/v2`
with a migration note. The formal freeze follows the v0.3 marketplace-feedback
round: afterwards even additive changes land only after public discussion in
[GitHub Discussions](https://github.com/rogerdigital/dsh-vet/discussions)
and the [dsh-plugin topic](https://github.com/topics/dsh-plugin).
