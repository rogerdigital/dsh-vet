# perm.unreachable-files

Shipped files not reachable from any declared entry point.

## What it looks for

The module graph starts from `main`/`module`/`exports`/`bin` entry points and
follows static imports and literal `require`/`import()`. Files the graph never
reaches are listed.

## Severity / confidence policy

**info / high** — never affects a grade. Unreachable is not malicious: dead
code, fixtures, and dynamic-graph plugins all produce it. It is reported
because shipped-but-unreachable files can still be `require`d at runtime by
design or by an attacker, and a reviewer should know they exist.

## False positives

Plugins that build their module graph from config strings at runtime. This is
the same population as `obf.dynamic-require`; the fix there (plain
specifiers) fixes the noise here.

## Remediation

Delete dead files or wire them into the import graph.
