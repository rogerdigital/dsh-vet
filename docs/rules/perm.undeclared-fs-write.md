# perm.undeclared-fs-write

Writes or deletes files outside any plausible plugin scope.

## What it looks for

Calls to write/delete filesystem APIs (`writeFile`, `rm`, `unlink`,
`truncate`, `rename`, …) in shipped JS. Literal absolute paths **outside** the
plausible scope — the temp directory and the DSH home subtree
(`~/.dsh`, `~/.config/dsh`, `~/.cache/dsh`) — are flagged. Relative paths and
in-scope paths are not.

## Severity / confidence policy

- Destructive APIs (`rm`, `unlink`, `rmdir`, `truncate`) with a literal
  out-of-scope absolute path: **critical / high** — the spec reserves critical
  for destructive operations outside any declared scope.
- Non-destructive writes with a literal out-of-scope absolute path:
  **high / high.**
- Writes whose target is a runtime value: **low / low** — reported as
  "scope not statically verifiable", never as an out-of-scope claim the
  scanner cannot make, and never grade-affecting (ROADMAP D2). Normal
  plugins write dynamic paths constantly; this tier is a review prompt,
  not an accusation.

The runtime-value tier deliberately does **not** attempt the path-derivation
dataflow some disputes have asked for: constraint chains are usually
interprocedural (derive-and-validate in one function, delete in another),
beyond best-effort static analysis. The honest position is "unresolvable —
review the derivation", which is what the finding now says. Clarified via
[dispute #10](https://github.com/rogerdigital/dsh-vet/issues/10), whose
guarded managed-directory removal is the canonical well-reviewed case.

## False positives

A plugin that legitimately manages files elsewhere on disk (a backup tool,
say). The scope list is deliberately tiny; dispute with the use case and the
scope list gets a documented entry, not a silent exception.

## Remediation

Keep writes inside the workspace or the DSH home directory; derive paths from
configuration instead of literals.
