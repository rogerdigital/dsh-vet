# egress.secret-adjacent

Network calls reachable from code that reads secrets.

## What it looks for

Files that read secrets — `process.env`, `os.homedir()`, or credential-like
file paths (`.env*`, `credentials`, `auth.json`, `token`, `.dsh/`, `.ssh`,
`.npmrc`, `.netrc`) — and any network-client call in that file or in files
statically reachable **from** it.

## Severity / confidence policy

- **high** severity. Secrets plus egress in one static graph is the shape of
  exfiltration; it is also the shape of every API client that authenticates,
  so severity stays at high, not critical — critical requires proof of data
  flow, which static analysis does not have.
- Confidence **medium** when the same file reads a secret and calls a
  literal endpoint (the common, explainable API-client case); **low** when
  the connection only exists through imports.

## False positives

Any legitimate authenticated client. This finding is the report's most
important *signal, not verdict* case: read the endpoints, decide if the data
flow matches the plugin's documented purpose.

## Remediation

Keep secret reads and network clients in separate modules, or document the
intended data flow for each endpoint.
