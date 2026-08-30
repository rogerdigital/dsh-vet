# dep.typosquat-proximity

Dependency name is one or two edits from a popular `dsh-*` package.

## What it looks for

Each runtime dependency is compared (bounded Levenshtein distance) against a
curated list of popular `dsh-*` package names. Every list entry is verified
to exist on npm — a name that cannot be installed cannot be typosquatted —
and the list is re-checked during calibration sweeps. Exact matches to a
popular name are skipped.

## Severity / confidence policy

- Distance 1 (one insert/delete/substitute away): **high / medium.**
- Distance 2: **low / medium** — reported, cannot lower a grade.

Confidence stays medium because proximity is a heuristic, not proof: the
dependency's repository, publisher, and download history decide.

## False positives

Legitimate adjacent names (a monorepo's `-cli`/`-core` companions, or a name
that happens to differ by one edit). Dispute with the package's provenance
and, if the name is established, it joins the popular list.

## Remediation

Verify the dependency is the package you mean — exact spelling, real
repository, real publisher.
