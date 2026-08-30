# perm.network-client

Opens network connections.

## What it looks for

Client-side network calls: `http(s).request/get`, `net.connect`,
`net.createConnection`, `tls.connect`, `dns.lookup/resolve`,
`dgram.createSocket`, global `fetch`, `new WebSocket()`.

## Severity / confidence policy

- Client calls present, no `"web"` seam declared: **medium / high.**
- `"web"` declared in `dsh.seams`: **info / high** — expected capability,
  reported for inventory (the endpoints themselves are listed by
  `egress.outbound-endpoints`).
- Network modules imported with no observable client call: **info / high.**

## False positives

Server-only listeners (`http.createServer`) are intentionally not counted.
Transitive network use inside dependencies is not attributed to the plugin
here — dependency scanning is the `dep.*` family's business.

## Remediation

Declare the web seam in `dsh.seams`, or drop the network access.
