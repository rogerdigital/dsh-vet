# dep.floating-range

Runtime dependencies that resolve to whatever the registry serves.

## What it looks for

`dependencies` entries whose spec is `*`, `latest`, `x`, or empty — anything
the registry can satisfy with a version that did not exist when the plugin
was last reviewed. `^` and `~` ranges are **not** flagged: they are normal
npm practice and stay within a reviewed major/minor.

Only `dependencies` are checked; `devDependencies` do not execute on the
installing user's machine.

## Severity / confidence policy

**medium / high** — the spec's supply-chain tier.

## False positives

Rare; the floating set is deliberately minimal. If an ecosystem convention
emerges around another spec form, it gets listed here.

## Remediation

Pin to an exact version or a narrow range.
