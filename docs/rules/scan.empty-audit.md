# scan.empty-audit

No analyzable JavaScript found in the target.

## What it looks for

The scanner found zero `.js`/`.mjs`/`.cjs` files (or Node-shebang bin
scripts) in the audited tree. This rule fires on behalf of the report's
readers: a scan that audited nothing must not read as a clean pass.

## Severity / confidence policy

**medium / high.** Nothing was analyzed — that is a fact, and a grade of A
here would be vacuous. Found live during v0.2 activation: a
TypeScript-source repository scanned as a local path ships no `.js` in its
working tree, so `.` audits nothing while the badge reads green.

## False positives

Targets that genuinely contain no JavaScript at all (a data package, a
documentation bundle). If that is you, the finding is still correct — you
are advertising an audit that cannot say anything.

## Remediation

Audit what actually ships: pass the npm package specifier (or a directory
containing the built output) instead of the source tree.
