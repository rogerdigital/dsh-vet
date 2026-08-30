# perm.subprocess-spawn

Spawns subprocesses.

## What it looks for

`child_process` call sites: `spawn`, `exec`, `execFile`, `fork` and their
`*Sync` variants, reached through any import style (ESM named/default, CJS
`require`, destructuring).

## Severity / confidence policy

- Spawn call sites present, no `"shell"` seam declared: **medium / high.**
  The call is a fact; whether it is justified is the reader's call.
- `"shell"` declared in `dsh.seams`: **info / high** — expected capability,
  reported for inventory.
- `child_process` imported but never called: **info / high** (dead import,
  not an exercised capability).

## False positives

Plugins whose whole purpose is running commands (a shell helper, a runner).
Declaring the `shell` seam turns the finding into inventory; the honest fix
is the declaration, not the report's silence.

## Remediation

Declare the shell seam in `dsh.seams`, or avoid spawning processes.
