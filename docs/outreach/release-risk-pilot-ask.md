<!-- Destination: issue (or DM) to the author of each target plugin, one
     thread per plugin. The template below is filled with real pre-run
     results — send as-is; the recipient installs nothing and answers from
     their own knowledge of the release. Send from the maintainer's account,
     then record each thread link in docs/release-risk-pilot.md. -->

# Release-risk pilot ask (template)

Subject: `Did your last release change what your plugin can do? (2-minute check)`

Hi — I maintain [`dsh-vet`](https://github.com/rogerdigital/dsh-vet), the
static audit tool for DSH plugins. It just learned to **compare two
releases of the same plugin and report exactly what risk-relevant
behavior changed** — new endpoints, new capabilities, new install
scripts, changed confidence — while ignoring line moves and reformatting.

I ran it on your last two releases so you don't have to install anything.
The results are below; three questions at the end.

---

## Filled example — dsh-doctor 0.4.2 → 0.4.3

Both scans: same scanner, full rule profile, complete coverage. Grades
stayed **D → D**. What moved:

- **New network client call** in `lib/client.js` — the destination is
  computed at runtime, so the scanner can't see where it sends
  (`perm.network-client`, subject `runtime-target`).
- **Subprocess spawns went from 1 to 2** in `lib/index.js`
  (`child_process.spawn`).

Nothing else changed (13 identities unchanged).

## Filled example — dsh-searxng 0.2.1 → 0.3.0

Grades stayed **A → A**. One transition: **write/delete calls with
runtime-computed targets went from 1 to 17** in `lib/cli.mjs`
(`perm.undeclared-fs-write`, dynamic variant). These are low-severity /
low-confidence — they never affect the grade — but the count jump is the
kind of thing worth a look during a minor bump.

## Filled example — dsh-wechat 0.9.5 → 0.9.6

**Zero risk-relevant changes.** All 7 audited behaviors identical, grade
C → C. If that matches your intent for the release, the diff just saved
you the re-review.

---

## The three questions

1. Does the reported delta match what you intended to change in that
   release? Anything you'd flag that the scanner missed or got wrong?
2. Any entries that felt like noise (didn't help you understand the
   release)?
3. If this ran automatically on your PRs against the base revision —
   [one Action input](https://github.com/rogerdigital/dsh-vet/blob/main/action/README.md#comparing-releases) —
   would you read it before merging?

Answers in any form are useful; I'll record anonymized takeaways in the
[pilot record](https://github.com/rogerdigital/dsh-vet/blob/main/docs/release-risk-pilot.md).
This is the last feedback loop before deciding whether to build CI
gating on top (opt-in "fail on new risk"), so negative answers are as
valuable as positive ones.

<!-- Per-send checklist:
     - re-run the pair with the latest main build the day of sending
     - paste the actual result block for THIS author's package
     - keep grades/identities verbatim from the diff, don't paraphrase
     - one package per thread; don't batch multiple authors -->
