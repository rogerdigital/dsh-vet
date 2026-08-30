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
- Writes whose target is a runtime value: **medium / low** (ROADMAP D2 —
  runtime-dependent findings never lower a grade on their own).

## False positives

A plugin that legitimately manages files elsewhere on disk (a backup tool,
say). The scope list is deliberately tiny; dispute with the use case and the
scope list gets a documented entry, not a silent exception.

## Remediation

Keep writes inside the workspace or the DSH home directory; derive paths from
configuration instead of literals.
