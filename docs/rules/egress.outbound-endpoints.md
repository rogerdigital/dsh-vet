# egress.outbound-endpoints

Outbound endpoints the code can contact.

## What it looks for

Literal hosts and URLs passed to the network-client calls tracked by
`perm.network-client`. One evidence entry per unique endpoint (URLs reduce
to their host), sorted, with the first call site.

## Severity / confidence policy

**info / high.** This rule is inventory, never a judgment: contacting a host
is not wrong, but every host is a data-flow decision the author owns, and
consumers of the report deserve the list. Grading is left to
`egress.secret-adjacent` when endpoints meet secret reads.

Endpoints with non-literal (runtime-computed) targets cannot be listed —
that gap shows up as `obf.dynamic-require`-style opacity elsewhere.

## False positives

Endpoints that are never contacted in practice (dead code paths) still
appear; reachability from an entry point is visible in the report via
`perm.unreachable-files`.

## Remediation

Document each endpoint in the README.
