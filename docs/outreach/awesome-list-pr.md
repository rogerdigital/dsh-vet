<!-- Destination: PR against a dsh / agent-skills / security-tools awesome list.
     Swap in the list's entry format (table vs bullet) and category. -->

PR title: `Add dsh-vet — pre-install security audits for DSH plugins`

## What

[dsh-vet](https://github.com/rogerdigital/dsh-vet) — static security vetting
for DeepSeek Harness plugins, built around an open report contract:

```markdown
- [dsh-vet](https://github.com/rogerdigital/dsh-vet) — pre-install permission & supply-chain audits
  for DSH plugins; emits the open `dsh-vet/v1` report (severity + confidence, derived grades),
  ships a CI Action + auditable badge, and validates/renders reports from any conforming emitter.
```

or, for table-format lists:

```markdown
| [dsh-vet](https://github.com/rogerdigital/dsh-vet) | CLI · library · CI Action | Pre-install static audits for DSH plugins; emits and verifies the open `dsh-vet/v1` report |
```

## Why it fits

- Solves a live pain: the community's top feature request is marketplace
  review standards (deepseek-harness#1115); incidents like the Full Access
  home-directory wipe (#461) show the stakes.
- Not another closed tool: the differentiating artifact is the
  implementation-agnostic report contract — any scanner may emit it, any
  marketplace/UI may consume it, `dsh-vet validate` verifies conformance.
- Maintained in the open: public per-rule rationales, public
  false-positive dispute process, calibration record against 11 real
  plugins, self-audited with its own scanner, MIT.

## Checks

- [ ] MIT licensed, docs and tests present, CI green
- [x] Installable via npm (`dsh-vet`), runs via `npx`, zero runtime deps
      beyond the parser
