# obf.dynamic-require

Loads modules through a computed specifier.

## What it looks for

`require(x)` and `import(x)` where `x` is not a plain string literal —
runtime variables, or concatenations that static evaluation can recover
(`'./mod-' + 'ule.js'`).

## Severity / confidence policy

- Concatenation that statically resolves to one value: **medium / medium.**
  The loaded module is knowable, but the graph hides from naive review.
- Fully runtime-dependent specifier: **medium / low** (ROADMAP D2 — depends
  on runtime values, so it never lowers a grade by itself).

## False positives

Optional-dependency loaders (`require(name)` in a try/catch) and plugin
systems that resolve names from config. Those are exactly the patterns the
finding asks you to make visible — the specifier is recoverable, say it in
the source.

## Remediation

Use plain specifiers so the module graph stays auditable.
