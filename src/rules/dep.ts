/**
 * `dep.*` — dependency supply chain (ROADMAP T3): install scripts, floating
 * ranges, and typosquat-adjacent names near popular `dsh-*` packages.
 */

import type { Rule } from '../rule.ts'
import { editDistance, finding } from '../rule.ts'

const LIFECYCLE_SCRIPTS = ['preinstall', 'install', 'postinstall']

export const installScripts: Rule = {
  id: 'dep.install-scripts',
  title: 'Runs code at install time',
  defaultSeverity: 'medium',
  defaultConfidence: 'high',
  check({ analysis }) {
    const scripts = analysis.pkg?.scripts ?? {}
    const present = LIFECYCLE_SCRIPTS.filter((name) => typeof scripts[name] === 'string' && scripts[name] !== '')
    if (present.length === 0) return []
    return [
      finding(this, {
        evidence: present.map((name) => ({
          file: 'package.json',
          snippet: scripts[name],
          note: `${name} script runs when the package is installed`,
        })),
        remediation:
          'Remove the lifecycle script, or move the work to a prepublish/build step and document why install-time execution is required.',
        references: ['https://github.com/rogerdigital/dsh-vet/blob/main/docs/rules/dep.install-scripts.md'],
      }),
    ]
  },
}

const FLOATING = new Set(['', '*', 'latest', 'x', 'X'])

export const floatingRange: Rule = {
  id: 'dep.floating-range',
  title: 'Runtime dependencies resolve to whatever the registry serves',
  defaultSeverity: 'medium',
  defaultConfidence: 'high',
  check({ analysis }) {
    const deps = analysis.pkg?.dependencies ?? {}
    const floating = Object.entries(deps).filter(([, spec]) => FLOATING.has(spec.trim()))
    if (floating.length === 0) return []
    return [
      finding(this, {
        evidence: floating.map(([name, spec]) => ({
          file: 'package.json',
          note: `"${name}": "${spec}" — any future version satisfies this`,
        })),
        remediation: 'Pin to a exact version or a narrow range.',
        references: ['https://github.com/rogerdigital/dsh-vet/blob/main/docs/rules/dep.floating-range.md'],
      }),
    ]
  },
}

/**
 * Popular `dsh-*` names worth impersonating. Seeded from the ecosystem tools
 * this project's README compares against; extend as adoption grows.
 */
const POPULAR_NAMES = [
  'dsh-doctor',
  'dsh-plugin-audit',
  'dsh-plugin-vetting',
  'dsh-ankh-guard',
  'dsh-audit',
  'dsh-searxng',
  'dsh-vault',
]

export const typosquatProximity: Rule = {
  id: 'dep.typosquat-proximity',
  title: 'Dependency name is one or two edits from a popular dsh-* package',
  defaultSeverity: 'high',
  defaultConfidence: 'medium',
  check({ analysis }) {
    const deps = Object.keys(analysis.pkg?.dependencies ?? {})
    const hits: Array<{ dep: string; near: string; distance: number }> = []
    for (const dep of deps) {
      if (POPULAR_NAMES.includes(dep)) continue
      for (const popular of POPULAR_NAMES) {
        const distance = editDistance(dep, popular, 2)
        if (distance <= 2) hits.push({ dep, near: popular, distance })
      }
    }
    if (hits.length === 0) return []
    hits.sort((a, b) => a.distance - b.distance || a.dep.localeCompare(b.dep))
    const worst = hits[0]!.distance
    return [
      finding(this, {
        severity: worst === 1 ? 'high' : 'low',
        evidence: hits.slice(0, 10).map((hit) => ({
          file: 'package.json',
          note: `"${hit.dep}" is ${hit.distance} edit${hit.distance === 1 ? '' : 's'} from "${hit.near}"`,
        })),
        remediation: 'Verify the dependency is the package you mean — exact spelling, real repository, real publisher.',
        references: ['https://github.com/rogerdigital/dsh-vet/blob/main/docs/rules/dep.typosquat-proximity.md'],
      }),
    ]
  },
}

export const depRules: Rule[] = [installScripts, floatingRange, typosquatProximity]
