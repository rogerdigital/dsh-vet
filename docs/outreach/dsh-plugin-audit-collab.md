<!-- Destination: issue on dsh-plugin-audit's repo (or DM to its maintainers).
     Tone: peer-to-peer, one concrete ask (a conversation), no commitment demanded. -->

Hi — maintainer of [dsh-vet](https://github.com/rogerdigital/dsh-vet) here.
Your runtime-sentinel work is in our README's comparison table as the
complementary half of this problem, and I'd like to make that explicit
instead of just documented on our side.

The shape of it:

- **dsh-vet** answers *"what does this plugin do?"* **before install** —
  static analysis, emitted as the open
  [`dsh-vet/v1`](https://github.com/rogerdigital/dsh-vet/blob/main/docs/dsh-vet-v1.md)
  report (findings with severity + confidence, derived grades, evidence per
  finding).
- **dsh-plugin-audit** answers *"what is it doing right now?"* at runtime —
  permission profiling and sentinels.

Static-before-install and runtime-during-use cover different failure modes
(obfuscated payloads vs. behavior that only emerges live), which is why we
list you as complementary rather than competing — and why we'd rather
coordinate than FUD.

Two things that might be cheap and useful, if you're interested:

1. **Shared vocabulary.** Our report contract deliberately leaves rule ids
   open-ended (`acme.eval-detect` style vendor prefixes). If your runtime
   findings ever want a common shape — severity/confidence semantics,
   evidence, dispute channels — the contract is additive-only and open for
   feedback before its formal freeze. You'd be the most natural co-author
   of whatever `/v1` learns from runtime auditing.
2. **Cross-linking.** We already point to you as the runtime half; a link
   back from your side (if you find the pre-install half useful) would let
   users find the full stack.

No ask beyond a conversation — if either half sounds useful, I'm happy to
open a discussion with concrete details.
