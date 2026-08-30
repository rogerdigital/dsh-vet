# obf.eval-detect

Evaluates dynamically built code.

## What it looks for

`eval(...)` calls and `new Function(...)` constructions in shipped JS.

## Severity / confidence policy

- Argument is not a string literal (variable, concatenation, decoding result):
  **medium / medium** — the spec's "eval of non-literal input" tier.
- Argument is a constant string: **info / high** — inert (the code is visible
  in the literal), still reported because eval-shaped code is where payload
  injection starts.

## False positives

DSLs and template engines that genuinely need runtime compilation. Declare
the case in your README; if the pattern is common enough, the rule learns a
documented exception.

## Remediation

Replace `eval`/`new Function` with direct code; dynamic evaluation defeats
static audit.
