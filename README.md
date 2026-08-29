# dsh-vet

Security vetting for DeepSeek Harness (DSH) plugins: permission & supply-chain
audits before install, graded via the open [`dsh-vet/v1`](docs/dsh-vet-v1.md)
report standard.

> **Status: early development.** The report contract is published as a draft;
> the reference scanner lands in v0.1. Nothing is installable yet — watch
> releases rather than depending on this branch.

## Why

DSH's everything-is-a-plugin architecture is its greatest strength and its
largest attack surface: a plugin you install can register tools, touch the
filesystem, and open network connections. The community's single most-upvoted
feature request asks for marketplace standards and review mechanisms
([deepseek-harness#1115](https://github.com/deepseek-ai/deepseek-harness/discussions/1115)),
and incidents like a Full Access session deleting a user's home directory
([#461](https://github.com/deepseek-ai/deepseek-harness/discussions/461)) show
the stakes. The official marketplace will take time; trust tooling cannot.

`dsh-vet` exists so that "should I install this plugin?" has a shared,
machine-readable answer instead of vibes.

## What it checks (v0.1 scope)

- **Capability surface** — which Cordis seams a plugin injects (`fs`, `shell`,
  `web`, …) versus what its manifest and README claim
- **Supply chain** — dependency tree, install scripts, `postinstall` hooks,
  typosquat-adjacent package names
- **Obfuscated behavior** — `eval` / `new Function` / dynamic `require` /
  encoded payloads
- **Data egress** — outbound endpoints reachable from code that can read
  secrets, session data, or the DSH home directory

## The `dsh-vet/v1` report standard

The differentiating piece is not another scanner — it is
[`docs/dsh-vet-v1.md`](docs/dsh-vet-v1.md): an implementation-agnostic,
deterministic JSON report contract (findings with severity **and confidence**,
derived A–F grades) that any scanner may emit and any marketplace, CI job, or
UI may consume, in the spirit of the community's `dsh-doctor/v1` contract.
The TypeScript reference types ship from this package; third-party emitters
are welcome and listed here once verified.

## How it differs

| Tool | Form | Focus |
|---|---|---|
| `dsh-plugin-vetting` | dsh plugin | install-time static heuristics |
| `dsh-audit` | CLI | ecosystem-wide catalog scoring (maintenance / docs / npm, security veto) |
| `dsh-plugin-audit` | dsh plugin | per-plugin permission profiling + runtime sentinel |
| `plugin_vet` skill pack | agent skills | audit methodology + gate |
| **`dsh-vet`** | library + CLI + CI action | the open `dsh-vet/v1` report contract, a reference scanner, and author-side badges — the shared trust layer others can emit and consume |

## Findings are signals, not verdicts

A report describes what code does, not what its author intended. Low-confidence
findings never lower a grade, and every finding carries evidence and a
remediation. If you believe a finding about your plugin is wrong, open a
[false-positive dispute](.github/ISSUE_TEMPLATE/false-positive.md) — disputed
rules get re-examined and the rule set gets corrected in public.

## Roadmap

- **v0.1** — contract frozen; reference CLI (`dsh vet <pkg>`) with the four
  check families above
- **v0.2** — GitHub Action + badge so plugin authors self-audit and publish
  their grade
- **v0.3** — marketplace integrations render `dsh-vet/v1` reports; contract
  adopted by at least one third-party emitter

## Develop

```sh
pnpm install
pnpm test      # vitest
pnpm build     # tsdown → lib/
pnpm verify    # typecheck + test + build + pack check
```

## Security

Reporting a vulnerability in dsh-vet itself: see [SECURITY.md](SECURITY.md).
dsh-vet runs locally, reads the npm registry for dependency metadata, and
never transmits audited code or results anywhere.

## License

[MIT](LICENSE)
