/**
 * `perm.*` — capability surface vs declared seams (ROADMAP T3).
 *
 * Seams are declared in package.json `dsh.seams` (e.g. `["fs","web"]`). The
 * vocabulary maps detected capabilities to seams: fs/fs-write → `fs`,
 * child_process → `shell`, net → `web`, worker_threads → `workers`. When no
 * declaration exists the mismatch rule stays silent — only the per-capability
 * rules speak, conservatively.
 */

import { homedir, tmpdir } from 'node:os'
import type { Rule } from '../rule.ts'
import { capEvidence, declaresSeam, finding, usesOfCap } from '../rule.ts'

const SEAM_FOR_CAP: Record<string, string> = {
  fs: 'fs',
  'fs-write': 'fs',
  shell: 'shell',
  net: 'web',
  workers: 'workers',
}

export const seamMismatch: Rule = {
  id: 'perm.seam-mismatch',
  title: 'Capability used but not declared in dsh.seams',
  defaultSeverity: 'medium',
  defaultConfidence: 'medium',
  check({ analysis }) {
    const declared = analysis.pkg?.seams
    if (!declared) return []
    const lower = new Set(declared.map((s) => s.toLowerCase()))
    const evidence = []
    for (const [cap, seam] of Object.entries(SEAM_FOR_CAP)) {
      if (lower.has(seam)) continue
      const use = usesOfCap(analysis, cap)[0]
      if (!use) continue
      evidence.push({
        file: use.file,
        line: use.line,
        snippet: use.snippet,
        note: `${cap} capability used; seam '${seam}' is not among the declared [${declared.join(', ')}]`,
      })
    }
    if (evidence.length === 0) return []
    return [
      finding(this, {
        evidence,
        remediation: 'Add the seam to dsh.seams, or drop the capability if it is not needed.',
        references: ['https://github.com/rogerdigital/dsh-vet/blob/main/docs/rules/perm.seam-mismatch.md'],
      }),
    ]
  },
}

const DESTRUCTIVE_FS = new Set([
  'fs.rm', 'fs.rmSync', 'fs.unlink', 'fs.unlinkSync', 'fs.rmdir', 'fs.rmdirSync',
  'fs.truncate', 'fs.truncateSync', 'fs/promises.rm', 'fs/promises.unlink',
  'fs/promises.rmdir', 'fs/promises.truncate',
])

/** Literal absolute paths that count as inside a plugin's plausible scope. */
function inScopeLiteral(path: string): boolean {
  const scopeRoots = [tmpdir(), `${homedir()}/.dsh`, `${homedir()}/.config/dsh`, `${homedir()}/.cache/dsh`]
  return scopeRoots.some((root) => path === root || path.startsWith(`${root}/`))
}

export const undeclaredFsWrite: Rule = {
  id: 'perm.undeclared-fs-write',
  title: 'Writes or deletes files outside any plausible plugin scope',
  defaultSeverity: 'high',
  defaultConfidence: 'medium',
  check({ analysis }) {
    const uses = usesOfCap(analysis, 'fs-write')
    if (uses.length === 0) return []
    const outOfScope = uses.filter((use) => use.literals.some((l) => l.startsWith('/') && !inScopeLiteral(l)))
    const dynamic = uses.filter((use) => use.literals.length === 0)

    const findings = []
    if (outOfScope.length > 0) {
      const destructive = outOfScope.some((use) => DESTRUCTIVE_FS.has(use.api))
      findings.push(
        finding(this, {
          title: destructive
            ? 'Destructive filesystem operations outside any plausible plugin scope'
            : this.title,
          severity: destructive ? 'critical' : 'high',
          confidence: 'high',
          evidence: capEvidence(
            outOfScope.map((use) => ({
              file: use.file,
              line: use.line,
              snippet: use.snippet,
              note: `${use.api} with literal path ${use.literals.find((l) => l.startsWith('/') && !inScopeLiteral(l))}`,
            })),
          ),
          remediation:
            'Keep writes inside the workspace or the DSH home directory; derive paths from config, not literals.',
          references: ['https://github.com/rogerdigital/dsh-vet/blob/main/docs/rules/perm.undeclared-fs-write.md'],
        }),
      )
    }
    if (dynamic.length > 0) {
      findings.push(
        finding(this, {
          title: 'Write/delete target is a runtime value — scope not statically verifiable',
          severity: 'low',
          confidence: 'low',
          evidence: capEvidence(
            dynamic.map((use) => ({
              file: use.file,
              line: use.line,
              snippet: use.snippet,
              note: 'review how the target is derived; the scanner cannot resolve it statically',
            })),
            5,
          ),
          remediation:
            'Keep the derivation next to the call, test the invariant (fixed child of a validated root), and document the managed scope so reviewers can verify it.',
          references: ['https://github.com/rogerdigital/dsh-vet/blob/main/docs/rules/perm.undeclared-fs-write.md'],
        }),
      )
    }
    return findings
  },
}

const NET_IMPORT_RE = /^(?:node:)?(?:net|http|https|http2|tls|dgram|dns|undici)$/

export const subprocessSpawn: Rule = {
  id: 'perm.subprocess-spawn',
  title: 'Spawns subprocesses',
  defaultSeverity: 'medium',
  defaultConfidence: 'high',
  check({ analysis }) {
    const declared = declaresSeam(analysis, 'shell')
    const uses = usesOfCap(analysis, 'shell')
    const findings = []
    if (uses.length > 0) {
      findings.push(
        finding(this, {
          severity: declared === true ? 'info' : 'medium',
          confidence: 'high',
          evidence: capEvidence(
            uses.map((use) => ({
              file: use.file,
              line: use.line,
              snippet: use.snippet,
              note: declared === true ? 'seam "shell" is declared' : 'no "shell" seam declared',
            })),
            5,
          ),
          remediation: 'Declare the shell seam in dsh.seams, or avoid spawning processes.',
          references: ['https://github.com/rogerdigital/dsh-vet/blob/main/docs/rules/perm.subprocess-spawn.md'],
        }),
      )
    }
    const importOnly = analysis.files.filter(
      (f) => f.externals.some((e) => /^(?:node:)?child_process$/.test(e)) && !uses.some((u) => u.file === f.path),
    )
    if (importOnly.length > 0) {
      findings.push(
        finding(this, {
          title: 'Imports child_process without spawning anything',
          severity: 'info',
          confidence: 'high',
          evidence: importOnly.slice(0, 5).map((f) => ({
            file: f.path,
            note: 'import present, no spawn/exec call site found',
          })),
          remediation: 'Remove the unused import.',
          references: ['https://github.com/rogerdigital/dsh-vet/blob/main/docs/rules/perm.subprocess-spawn.md'],
        }),
      )
    }
    return findings
  },
}

export const networkClient: Rule = {
  id: 'perm.network-client',
  title: 'Opens network connections',
  defaultSeverity: 'medium',
  defaultConfidence: 'high',
  check({ analysis }) {
    const declared = declaresSeam(analysis, 'web')
    const findings = []
    if (analysis.netUses.length > 0) {
      findings.push(
        finding(this, {
          severity: declared === true ? 'info' : 'medium',
          confidence: 'high',
          evidence: capEvidence(
            analysis.netUses.map((use) => ({
              file: use.file,
              line: use.line,
              snippet: use.snippet,
              note:
                declared === true
                  ? 'seam "web" is declared'
                  : `no "web" seam declared (${use.literals.join(', ') || 'target not statically known'})`,
            })),
            5,
          ),
          remediation: 'Declare the web seam in dsh.seams, or drop the network access.',
          references: ['https://github.com/rogerdigital/dsh-vet/blob/main/docs/rules/perm.network-client.md'],
        }),
      )
    }
    const importOnly = analysis.files.filter(
      (f) => f.externals.some((e) => NET_IMPORT_RE.test(e)) && !analysis.netUses.some((u) => u.file === f.path),
    )
    if (importOnly.length > 0) {
      findings.push(
        finding(this, {
          title: 'Imports network modules without an observable client call',
          severity: 'info',
          confidence: 'high',
          evidence: importOnly.slice(0, 5).map((f) => ({ file: f.path, note: 'import present, no client call site' })),
          remediation: 'Remove the unused import.',
          references: ['https://github.com/rogerdigital/dsh-vet/blob/main/docs/rules/perm.network-client.md'],
        }),
      )
    }
    return findings
  },
}

export const unreachableFiles: Rule = {
  id: 'perm.unreachable-files',
  title: 'Shipped files not reachable from any declared entry point',
  defaultSeverity: 'info',
  defaultConfidence: 'high',
  check({ analysis }) {
    if (analysis.unreachable.length === 0) return []
    return [
      finding(this, {
        evidence: analysis.unreachable.slice(0, 10).map((path) => ({
          file: path,
          note: 'no static import path from any entry point reaches this file',
        })),
        remediation:
          'Dead files still ship and can be required dynamically; delete them or wire them into the graph.',
        references: ['https://github.com/rogerdigital/dsh-vet/blob/main/docs/rules/perm.unreachable-files.md'],
      }),
    ]
  },
}

export const permRules: Rule[] = [seamMismatch, undeclaredFsWrite, subprocessSpawn, networkClient, unreachableFiles]
