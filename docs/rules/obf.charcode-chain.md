# obf.charcode-chain

Builds strings from character codes.

## What it looks for

`String.fromCharCode(...)` calls with 8+ numeric literal arguments. The
finding's note shows the decoded preview, so the reviewer sees what is being
hidden from grep.

## Severity / confidence policy

**medium / medium.** Building a readable string through charcodes is not a
normal authoring pattern; there is a credible benign population (obfuscating
game spoilers, license checks) small enough to justify the confidence.

## False positives

Table-driven encoders (font subsets, protocol codecs) that feed arrays, not
inline literals — the literal-argument requirement excludes most of them.

## Remediation

Write the string literal directly.
