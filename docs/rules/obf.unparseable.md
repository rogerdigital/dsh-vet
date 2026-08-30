# obf.unparseable

Shipped JS files that no standard parser accepts.

## What it looks for

Files with a `.js`/`.mjs`/`.cjs` extension (or Node-shebang bin scripts) that
fail to parse both as an ECMAScript module and as a script under acorn.

## Severity / confidence policy

**medium / high.** That the file does not parse is certain; what it actually
runs is not. Shipped-unparseable JS usually means generated or deliberately
mangled code that plain review tooling cannot see into — the finding asks
for source that reviewers can read.

## False positives

New syntax acorn has not learned yet (bleeding-edge proposals), or files
that are data with a misleading extension. Dispute with the syntax; the
finder tracks acorn's version.

## Remediation

Ship parseable source, or source maps that let tooling see the real code.
