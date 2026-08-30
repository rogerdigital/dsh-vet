/**
 * `egress.*` — data egress (ROADMAP T3): outbound endpoint inventory, and
 * endpoints reachable from code that reads secrets or the DSH home directory.
 */

import { reachableFrom } from '../analyze.ts'
import type { Rule } from '../rule.ts'
import { capEvidence, finding } from '../rule.ts'

function endpointOf(literal: string): string {
  try {
    return new URL(literal).host
  } catch {
    return literal
  }
}

export const outboundEndpoints: Rule = {
  id: 'egress.outbound-endpoints',
  title: 'Outbound endpoints the code can contact',
  defaultSeverity: 'info',
  defaultConfidence: 'high',
  check({ analysis }) {
    const byEndpoint = new Map<string, { file: string; line: number; snippet: string }>()
    for (const use of analysis.netUses) {
      for (const literal of use.literals) {
        const endpoint = endpointOf(literal)
        if (!endpoint) continue
        if (!byEndpoint.has(endpoint)) {
          byEndpoint.set(endpoint, { file: use.file, line: use.line, snippet: use.snippet })
        }
      }
    }
    if (byEndpoint.size === 0) return []
    const endpoints = [...byEndpoint.keys()].sort()
    return [
      finding(this, {
        evidence: endpoints.map((endpoint) => ({
          ...byEndpoint.get(endpoint)!,
          note: `endpoint ${endpoint}`,
        })),
        remediation: 'Document each endpoint in the README; every host here is a data-flow decision you own.',
        references: ['https://github.com/rogerdigital/dsh-vet/blob/main/docs/rules/egress.outbound-endpoints.md'],
      }),
    ]
  },
}

const SECRET_CAPS = new Set(['env', 'homedir', 'secret-read'])

export const secretAdjacent: Rule = {
  id: 'egress.secret-adjacent',
  title: 'Network calls reachable from code that reads secrets',
  defaultSeverity: 'high',
  defaultConfidence: 'low',
  check({ analysis }) {
    const secretFiles = new Set(analysis.capUses.filter((u) => SECRET_CAPS.has(u.cap)).map((u) => u.file))
    const evidence = []
    let sameFileLiteral = false
    for (const file of [...secretFiles].sort()) {
      const reads = analysis.capUses.filter((u) => SECRET_CAPS.has(u.cap) && u.file === file)
      const netScope = [file, ...reachableFrom(analysis, file)]
      const nets = analysis.netUses.filter((u) => netScope.includes(u.file))
      for (const net of nets) {
        if (net.file === file && net.literals.length > 0) sameFileLiteral = true
        for (const read of reads.slice(0, 2)) {
          evidence.push({
            file,
            line: read.line,
            snippet: read.snippet,
            note: `reads ${read.cap === 'env' ? 'process.env' : read.cap === 'homedir' ? 'the user home directory' : 'a credential-like file'}; ${net.api} in ${net.file}:${net.line} is statically reachable from here`,
          })
        }
      }
    }
    if (evidence.length === 0) return []
    return [
      finding(this, {
        confidence: sameFileLiteral ? 'medium' : 'low',
        evidence: capEvidence(evidence, 6),
        remediation:
          'Keep secret reads and network clients in separate modules, or document the intended data flow for each endpoint.',
        references: ['https://github.com/rogerdigital/dsh-vet/blob/main/docs/rules/egress.secret-adjacent.md'],
      }),
    ]
  },
}

export const egressRules: Rule[] = [outboundEndpoints, secretAdjacent]
