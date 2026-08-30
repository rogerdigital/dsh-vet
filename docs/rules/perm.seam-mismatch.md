# perm.seam-mismatch

Capability used by the plugin's code but not declared in `dsh.seams`.

## What it looks for

Seams are declared in package.json:

```json
{ "dsh": { "seams": ["fs", "web"] } }
```

Detected capabilities map to seams: `fs`/`fs-write` → `fs`, `child_process` →
`shell`, net/http/fetch → `web`, `worker_threads` → `workers`. When a
declaration exists and a detected capability's seam is missing from it, this
rule reports the first use site per missing seam.

## Severity / confidence policy

- **medium / medium.** The capability demonstrably exists; the declaration
  demonstrably omits it. Both are facts; the mismatch is the interpretation.
- When **no** `dsh.seams` declaration exists at all, this rule stays silent:
  an absent declaration is not a claim, and per-capability rules
  (`perm.subprocess-spawn`, `perm.network-client`) speak instead.

## False positives

A plugin that computes its seam set at runtime or documents capabilities in
README prose only. Dispute with evidence of the declaration and the rule will
be taught that form.

## Remediation

Add the seam to `dsh.seams`, or drop the capability if it is not needed.
