# dep.install-scripts

Runs code at install time.

## What it looks for

`preinstall`, `install`, and `postinstall` entries in package.json
`scripts`. These execute on the **installing** user's machine, before the
plugin has been audited or sandboxed by anything.

## Severity / confidence policy

**medium / high.** Presence is a fact from the manifest. The spec calls
install scripts without evident need *medium*; static analysis cannot see
"need", so the finding carries a remediation instead of a guess.

## False positives

Genuine build-from-source cases (native modules). The remediation documents
the expectation: explain the script in the README, or move the work to
publish time.

## Remediation

Remove the lifecycle script, or move the work to a prepublish/build step and
document why install-time execution is required.
