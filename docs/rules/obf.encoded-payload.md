# obf.encoded-payload

Long base64/hex string literals in shipped code.

## What it looks for

String literals of 48+ characters with no whitespace whose entire charset is
base64 (letters + digits + `/` `=`, actually mixing cases with digits) or hex
— and for hex, using at least 8 distinct characters. Palette and table data
(think `8888…`, d3 category colors) reuse a handful of digits; encoded
payloads use the alphabet broadly. The diversity floor was calibrated on the
v0.1 ecosystem sweep ([calibration record](../calibration-v0.1.md)).

## Severity / confidence policy

**medium / low.** An encoded blob is often legitimate (fonts, hashes,
fixtures) — hence low confidence: reported, never grade-affecting on its own.
It matters when it sits next to `eval` or egress, which is exactly what a
reviewer checks next.

## False positives

Sourcemaps-in-strings, embedded assets, test vectors. The finding is
inventory for reviewers; a blob with a visible decoder gets disputed in one
message.

## Remediation

Decode payloads to plain assets, or ship them as files a reviewer can open.
