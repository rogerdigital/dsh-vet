# Verified emitters of `dsh-vet/v1`

An **emitter** is any tool that produces `dsh-vet/v1` reports — a scanner
like this one, a CI integration, a marketplace's own analysis pipeline. The
contract is only useful if consumers can trust reports from emitters they
did not write, so this page defines what *verified* means and lists the
emitters that made it.

## What verified means

Verification is self-service: an emitter is listed when it has
**published** the evidence, not when anyone here has blessed it. Every
machine-checkable claim below can be re-checked by any consumer with the
documented commands — that is what keeps *verified* an auditable fact
rather than an endorsement.

The list is deliberately short: the contract carries the structure, this
page carries the honesty.

**Machine-checkable — anyone can verify these by running commands:**

1. **Structure.** Reports are built through `createReport()` from this
   package, or — for any emitter — every published report passes
   `dsh-vet validate` (`npx dsh-vet validate <report.json>`). Either path
   guarantees the derived summary, the deterministic sort, well-formed
   rule ids, and evidence on every finding; an emitter that hand-assembles
   reports and skips validation is not verified. Validation proves
   structure, not honesty — it cannot detect omitted findings, which is
   why the rest of this list exists.
2. **Determinism.** Two runs over the same artifact with the same emitter
   version produce identical reports, `scanner.ranAt` aside.
3. **Detection behavior.** The emitter has run the public
   [calibration corpus](calibration-method.md) and published its per-case
   results — what fires, what stays silent, per rule revision. Structural
   conformance cannot detect omitted findings; published corpus results
   are the closest honest substitute available today.

**Human-judged — read, not run. Listed as conditions, never as
procedural guarantees:**

4. **Conservative severity.** Findings follow the severity ladder in the
   [spec](dsh-vet-v1.md#severity-definitions); anything that depends on
   runtime values is emitted at `low` confidence (or reduced severity),
   never the reverse. The cost of a false positive is paid by a plugin
   author.
5. **Documented, disputable rules.** Third-party rule ids start with the
   vendor's own segment (`acme.eval-detect`) and each rule has a public
   rationale page; authors can contest findings somewhere with a visible
   record of corrections. A rule nobody can dispute in public is a rule
   nobody should trust.
6. **Honest output.** `scanner.name` and `scanner.version` identify the
   emitting tool as it actually ran; evidence snippets stay minimal and
   never include secrets.

## Getting listed

1. Publish, linkably from your repo: 2–3 sample reports against real
   plugins, the exact emitter version they came from, and your
   calibration-corpus results.
2. Open an issue here linking to that evidence. The listing links to
   *your* published results, not to our judgment of them.
3. Listings are spot-checked; breaking a condition above removes the
   listing, with the reason stated in the issue. Removal is public.

## Registry

Three separate claims, listed separately. Meeting one never implies
another — structural conformance says nothing about detection quality,
and neither says who ran the scanner.

### 1. Structural conformance

Items 1–2 above: reports that pass `dsh-vet validate` (or come from
`createReport()`), deterministically produced.

| Emitter | Verified versions | Evidence |
|---|---|---|
| [`dsh-vet`](https://github.com/rogerdigital/dsh-vet) | 0.1.0 – | every committed report validates on every CI run; conformance corpus in `test/fixtures/conformance/` |

### 2. Detection calibration

Item 3 above: the public
[calibration corpus](calibration-method.md) run and the per-case results
published by the emitter itself.

| Emitter | Rule catalog revision | Corpus results |
|---|---|---|
| `dsh-vet` | 0.4.0 | [corpus table](calibration-method.md#the-corpus), locked by `test/calibration.test.ts` |

### 3. Origin verification

Who produced a given report, and whether it applies to the artifact at
hand. Not yet defined — it ships with consumer artifact matching. No
emitter is listed; when the definition exists, so will the checklist.

Third-party emitters: none yet in any tier — the slots are open.
