<!-- Destination: follow-up comment in deepseek-ai/deepseek-harness discussion #1115
     (marketplace standards / review mechanisms), under our 2026-09-02 reply.
     Depends on: an npm release that ships `dsh-vet diff` (next version) —
     send from the maintainer's account, then record the thread link in ROADMAP. -->

Following up with the piece the contract was missing: **what changed since
the last release**.

"Should I install this plugin?" got a machine-readable answer with
`dsh-vet/v1`. "Should I *upgrade*?" now has one too:

- Every report records **what the scan actually covered** — rule profile,
  coverage, content digests, stable finding identities — as an optional
  `x-dsh-vet` extension ([spec](https://github.com/rogerdigital/dsh-vet/blob/main/docs/scan-context-v1.md)).
  A grade no longer silently means "whatever subset happened to run":
  partial coverage says so, in the CLI, the PR comment, and the badge.
- `dsh-vet diff` compares two reports from the same scanner and profile
  and reports added / removed / changed risk by **stable identity** —
  line moves and reformatting are not risk additions, a second endpoint
  is ([diff spec](https://github.com/rogerdigital/dsh-vet/blob/main/docs/report-diff-v1.md)).
  Two reports that can't be honestly compared say so with explicit
  reasons instead of a fake "no changes".
- The GitHub Action takes an optional `baseline-report` scanned from the
  merge base, so PRs show exactly what risk-relevant behavior the PR
  introduces — with a recipe that keeps the baseline out of the PR's
  control ([action docs](https://github.com/rogerdigital/dsh-vet/blob/main/action/README.md#comparing-releases)).

We piloted it on real releases —
[left-pad and chalk, every reported addition reconciled against the
code](https://github.com/rogerdigital/dsh-vet/blob/main/docs/release-risk-pilot.md).
The chalk case is the interesting one: 5.x vendored its dependencies and
the diff flagged exactly the two vendored files unreachable through the
`#`-imports map — nothing else moved.

If you maintain a plugin and want the same read on your last two
releases, reply here or open an issue — we'll run the comparison and
post the result for you to check against what you actually changed.
