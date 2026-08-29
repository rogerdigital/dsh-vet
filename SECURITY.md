# Security Policy

dsh-vet is a security tool; it must hold itself to the standard it applies to
others.

## Reporting a vulnerability in dsh-vet

Use [GitHub's private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-reviewing/privately-reporting-a-security-vulnerability)
for this repository. Please do not open a public issue for vulnerabilities in
dsh-vet itself. Reports are acknowledged within 7 days.

## Scope

- dsh-vet source code, its CLI, and future GitHub Action
- The `dsh-vet/v1` contract (ambiguities that lead consumers to mis-render
  severity or grade)

Out of scope: findings dsh-vet reports about *other* plugins. Those belong in
the [false-positive dispute template](.github/ISSUE_TEMPLATE/false-positive.md),
not in vulnerability disclosure.

## Trust commitments

- dsh-vet runs locally. It reads the npm registry for dependency metadata and
  nothing else over the network.
- It never transmits audited code, audit results, or telemetry anywhere.
- Secrets found in evidence are redacted, never included in reports.

## Disputing a finding about your plugin

See the [false-positive issue template](.github/ISSUE_TEMPLATE/false-positive.md).
Disputes are handled in public: if a rule is wrong, the rule changes and the
changelog says so.
