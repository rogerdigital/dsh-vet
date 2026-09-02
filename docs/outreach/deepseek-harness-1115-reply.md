<!-- Destination: reply in deepseek-ai/deepseek-harness discussion #1115
     (marketplace standards / review mechanisms). Send after 0.3.0 is on npm. -->

Sharing what we built against exactly this problem, in case it's useful
before an official marketplace lands.

The core idea: "should I install this plugin?" needs a **shared,
machine-readable answer**, not per-tool vibes. So the contract came first —
[`dsh-vet/v1`](https://github.com/rogerdigital/dsh-vet/blob/main/docs/dsh-vet-v1.md),
an implementation-agnostic audit report (findings with severity *and*
confidence, derived A–F grades), following the pattern `dsh-doctor/v1`
proved: freeze a small boring contract, compete on implementations.

On top of it:

- **A reference scanner** ([dsh-vet on npm](https://www.npmjs.com/package/dsh-vet)) —
  static, deterministic, never installs or transmits the audited plugin.
  16 rules across capability seams, supply chain, obfuscation, and data
  egress; every rule has a public rationale page and a public dispute
  template. Calibrated against 11 real ecosystem plugins
  ([sweep record](https://github.com/rogerdigital/dsh-vet/blob/main/docs/calibration-v0.1.md)).
- **Author-side CI** — a GitHub Action that audits on every push and
  publishes the report + grade badge from the plugin's own repo (zero
  server; the badge value is auditable through git history). Live in two
  repos already, including the scanner's own self-audit.
- **A consumer story** — `dsh-vet validate` checks any report against the
  contract (grade is recomputed from findings, so an emitter can't forge
  one), and `renderMarkdown` gives marketplaces/UIs the same rendering the
  Action uses: [adopting it](https://github.com/rogerdigital/dsh-vet/blob/main/docs/adopt-marketplace.md).

The contract has been additive-only since 0.1.0 — every report the first
release emitted still validates today. **We're actively seeking feedback
from marketplace and tool maintainers before formally freezing `/v1`.** If
you're building a catalog or review layer, this round is exactly for you:
what would you need the report to carry?

Happy to go deeper on any piece — severity calibration, false-positive
handling, or the freeze criteria.
