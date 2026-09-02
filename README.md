# dsh-vet

[![dsh-vet](https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Frogerdigital%2Fdsh-vet%2Fdsh-vet%2Freport%2F.dsh-vet%2Fbadge.json)](https://github.com/rogerdigital/dsh-vet/blob/dsh-vet/report/.dsh-vet/report.json)

Security vetting for DeepSeek Harness (DSH) plugins: permission & supply-chain
audits before install, graded via the open [`dsh-vet/v1`](docs/dsh-vet-v1.md)
report standard.

> **Status: v0.3 underway.** v0.2 shipped the author side — reference
> scanner ([npm](https://www.npmjs.com/package/dsh-vet), 16 calibrated rules
> with public rationales), CI Action, and auditable grade badges live in two
> repos. v0.3 is the ecosystem round: report validation for consumers, the
> verified-emitter program, and marketplace adoption before the contract's
> formal freeze ([roadmap](ROADMAP.md)).

## Install

Requires Node ≥ 20.

```sh
npm install -g dsh-vet        # or: pnpm add -g dsh-vet / bun add -g dsh-vet
dsh-vet --help
```

Prefer not installing? `npx dsh-vet <specifier>` runs the same scanner with
zero footprint. The scanner is the only thing that runs — dsh-vet never
installs the plugin it audits.

## Usage

```sh
npx dsh-vet <specifier>          # npm package, git URL, or local path
npx dsh-vet --json <specifier>   # dsh-vet/v1 report on stdout
npx dsh-vet --strict <specifier> # exit 1 on findings >= high (confidence >= medium)
npx dsh-vet --rules dep.install-scripts <specifier>
npx dsh-vet validate <report.json> # check a report against the contract
```

Any completed report exits `0` — grades describe findings, they do not gate.
Scanner failures exit non-zero. The scanner runs locally, reads the npm
registry for dependency metadata only, and never transmits audited code.

Shipped rules (each with a public rationale under
[`docs/rules/`](docs/rules)):

| Family | Rules |
|---|---|
| `perm.*` | seam-mismatch, undeclared-fs-write, subprocess-spawn, network-client, unreachable-files |
| `dep.*` | install-scripts, floating-range, typosquat-proximity |
| `obf.*` | eval-detect, dynamic-require, encoded-payload, charcode-chain, unparseable |
| `egress.*` | outbound-endpoints, secret-adjacent |

dsh-vet audits itself with the same scanner:
[`examples/dsh-vet.report.json`](examples/dsh-vet.report.json) is generated
from the exact tarball that ships (`npm pack` → scan), seams declared in
package.json. It is not an A-by-cheating report — every signal the scanner
finds in itself is in there.

## CI & badge for plugin authors

Audit your plugin on every push and PR, and publish your grade from the
report committed to your repository — shields.io reads the badge straight
from your repo, so its value is auditable through git history and no badge
service is involved:

```yaml
- uses: rogerdigital/dsh-vet/action@v0.2.0
  with:
    specifier: '.'
    commit-report: true
```

Every run uploads the full report as an artifact; PRs get a single
edited-in-place findings comment. Badge snippet and all inputs:
[`action/README.md`](action/README.md). The `dsh-vet badge <report.json>`
command renders the shields endpoint JSON if you wire CI yourself.

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
The TypeScript reference types and the reference markdown renderer ship from
this package; `dsh-vet validate` checks any report against the contract —
including the derived grade, so a report from an emitter you don't know can't
forge one. Third-party emitters are welcome and
[listed once verified](docs/emitters.md); marketplaces can start from
[docs/adopt-marketplace.md](docs/adopt-marketplace.md).

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

- **v0.1** — contract shipped (stable, additive-only since 0.1.0) + reference
  CLI (`dsh-vet <pkg>`) with the four check families above
- **v0.2** — GitHub Action + badge so plugin authors self-audit and publish
  their grade
- **v0.3** — ecosystem round: `dsh-vet validate` + the verified-emitter
  program, marketplace integrations rendering `dsh-vet/v1` reports, and the
  contract's formal freeze after the feedback round

The detailed, trackable plan — task breakdowns, recorded decisions,
definitions of done, risks, and kill criteria — lives in
[ROADMAP.md](ROADMAP.md).

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
