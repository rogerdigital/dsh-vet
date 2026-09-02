<!-- Destination: a community "Show Your Plugins" / project showcase thread.
     Adjust the opening line to the thread's framing. Send after 0.3.0 is on npm. -->

**dsh-vet** — know what a plugin does *before* you install it.

DSH's everything-is-a-plugin model is its superpower and its attack surface:
an installed plugin can touch your filesystem, spawn processes, and open
network connections. After the incident where a Full Access session wiped a
user's home directory, "should I install this?" deserved better than vibes.

dsh-vet audits any npm-installable DSH plugin — statically, locally, without
installing or executing it — and emits an open, deterministic
[`dsh-vet/v1`](https://github.com/rogerdigital/dsh-vet/blob/main/docs/dsh-vet-v1.md)
report: findings with severity **and** confidence, and a derived A–F grade
where a low-confidence finding never counts against you.

```sh
npx dsh-vet <plugin>        # human summary
npx dsh-vet --json <plugin> # full dsh-vet/v1 report
```

What makes it defensible rather than noisy:

- **Every rule has a public rationale** and a public false-positive dispute
  template; disputed rules get corrected in the open (it has happened, and
  the changelog shows it).
- **Calibrated on real plugins** — an 11-package sweep record is published,
  including grades and the two tunings the sweep forced.
- **It audits itself** — the repo's own grade badge is generated from the
  exact tarball that ships to npm, and every signal the scanner finds in
  itself is in the published report.

For plugin authors: a [GitHub Action](https://github.com/rogerdigital/dsh-vet/tree/main/action)
audits on every push and publishes your grade badge from your own repo —
no badge service, the value is auditable through your git history. For
catalog/UI builders: [`dsh-vet validate`](https://github.com/rogerdigital/dsh-vet/blob/main/docs/adopt-marketplace.md)
ingests and verifies reports from any conforming emitter.

The contract is additive-only since 0.1.0 and open for feedback before the
formal freeze. Repo: [rogerdigital/dsh-vet](https://github.com/rogerdigital/dsh-vet) —
criticism on severity calibration is genuinely welcome.
