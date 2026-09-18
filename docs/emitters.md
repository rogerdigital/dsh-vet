# Verified emitters of `dsh-vet/v1`

An **emitter** is any tool that produces `dsh-vet/v1` reports — a scanner
like this one, a CI integration, a marketplace's own analysis pipeline. The
contract is only useful if consumers can trust reports from emitters they
did not write, so this page defines what *verified* means and lists the
emitters that made it.

## The checklist

An emitter is listed as verified when it meets every item below. The list is
deliberately short: the contract carries the structure, this carries the
honesty.

1. **Structure.** Reports are built through `createReport()` from this
   package, or — for non-TypeScript emitters — every published report passes
   `dsh-vet validate` (`npx dsh-vet validate <report.json>`). Either path
   guarantees the derived summary, the deterministic sort, and well-formed
   rule ids; an emitter that hand-assembles reports and skips validation is
   not verified. Validation proves structure, not honesty — it cannot
   detect omitted findings, which is why the remaining items on this list
   exist.
2. **Determinism.** Two runs over the same artifact with the same emitter
   version produce identical reports, `scanner.ranAt` aside.
3. **Conservative severity.** Findings follow the severity ladder in the
   [spec](dsh-vet-v1.md#severity-definitions); anything that depends on
   runtime values is emitted at `low` confidence (or reduced severity), never
   the reverse. The cost of a false positive is paid by a plugin author.
4. **Evidence.** Every finding carries at least one evidence item (`file`,
   and `line` when the emitter has it); snippets are minimal and never
   include secrets.
5. **Vendor-prefixed, documented rules.** Third-party rule ids start with
   the vendor's own segment (`acme.eval-detect`) and each rule has a public
   rationale page — a rule nobody can dispute in public is a rule nobody
   should trust.
6. **A public dispute channel.** A place authors can contest findings, with
   a visible record of corrections.
7. **Honest `scanner` fields.** `name` and `version` identify the emitting
   tool as it actually ran.

## Verification process

1. The emitter's maintainer opens an issue here linking to the emitter and
   2–3 sample reports against real plugins.
2. We run `dsh-vet validate` on the samples and read the vendor rule docs,
   checking severity calibration against the spec ladder (item 3).
3. Both sides record the verified version range; listings link to the
   emitter's repo and rule docs. Breaking the checklist later removes the
   listing, with the reason stated in the issue.

## Registry

Three separate claims, listed separately. Meeting one never implies
another — structural conformance says nothing about detection quality,
and neither says who ran the scanner.

### 1. Structural conformance

Checklist items 1, 2, 4, and 7 above: builds through `createReport()` or
publishes reports that pass `dsh-vet validate`, deterministic output,
evidence on every finding, honest `scanner` fields.

| Emitter | Verified versions | Evidence |
|---|---|---|
| [`dsh-vet`](https://github.com/rogerdigital/dsh-vet) | 0.1.0 – | every committed report validates on every CI run; conformance corpus in `test/fixtures/conformance/` |

### 2. Detection calibration

Emitters that have run the public
[calibration corpus](calibration-method.md) and published their per-case
results. Structural conformance cannot detect omitted findings; running
the corpus in public is the closest honest substitute available today.

| Emitter | Rule catalog revision | Corpus results |
|---|---|---|
| `dsh-vet` | 0.4.0 | [corpus table](calibration-method.md#the-corpus), locked by `test/calibration.test.ts` |

### 3. Origin verification

Who produced a given report, and whether it applies to the artifact at
hand. Not yet defined — it ships with consumer artifact matching. No
emitter is listed; when the definition exists, so will the checklist.

Third-party emitters: none yet in any tier — the slots are open.
