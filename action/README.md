# dsh-vet GitHub Action

Audit your DSH plugin with `dsh-vet` on every push and pull request, and
publish your grade as a badge whose value is the report committed to your
repository — no badge service to run or trust (D3).

```yaml
name: dsh-vet
on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: write        # commit-report on the default branch
  pull-requests: write   # findings comment on PRs

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: rogerdigital/dsh-vet/action@v0.2.0
        with:
          specifier: '.'           # audit this repository's source
          commit-report: true      # keep .dsh-vet/report.json + badge.json on main
```

Every run uploads the full `dsh-vet/v1` report as the `dsh-vet-report`
artifact. On pull requests, findings are posted as a single comment that is
edited in place (never one comment per push). On pushes to the default
branch (or a manual `workflow_dispatch`), `commit-report: true` commits
`.dsh-vet/report.json` and `.dsh-vet/badge.json` — marked `[skip ci]`,
because reports always differ (`scanner.ranAt`) and an ordinary commit
would re-trigger workflows endlessly.

## Badge

Add to your README after the first `commit-report` run lands:

```markdown
[![dsh-vet](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/OWNER/REPO/main/.dsh-vet/badge.json)](https://github.com/OWNER/REPO/blob/main/.dsh-vet/report.json)
```

shields.io fetches `badge.json` straight from your repository; dsh-vet runs
no badge infrastructure and the badge value cannot drift from the committed
report.

## Inputs

| Input | Default | Description |
|---|---|---|
| `specifier` | `.` | What to audit: local path, npm package, or git URL |
| `version` | `0.2.0` | dsh-vet version, pinned from npm |
| `strict` | `false` | Fail the job on findings ≥ high with confidence ≥ medium |
| `fail-on` | — | Override the strict threshold (`critical\|high\|medium\|low`) |
| `rules` | — | Comma-separated rule ids to run (default: all) |
| `comment` | `true` | Comment findings on pull requests |
| `commit-report` | `false` | Commit report + badge on pushes to the default branch |
| `github-token` | `github.token` | Token used for PR comments |

## Notes

- The action is a composite of readable steps: it installs a pinned
  `dsh-vet` from npm, runs the scan, and executes the two small scripts in
  [`scripts/`](scripts). Nothing else — audit the action like you audit
  anything else you trust.
- Exit semantics match the CLI: a completed report never fails the job
  unless `strict`/`fail-on` says so; scanner errors always do.
- Findings are signals, not verdicts. Dispute a wrong one
  [in public](https://github.com/rogerdigital/dsh-vet/issues/new?template=false-positive.md).
