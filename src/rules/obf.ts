/**
 * `obf.*` — obfuscated behavior (ROADMAP T3): eval/new Function, dynamic
 * require/import, encoded string literals, charcode chains, unparseable files.
 */

import type { Rule } from '../rule.ts'
import { capEvidence, finding } from '../rule.ts'
import { subjectHash } from '../observations.ts'

export const evalDetect: Rule = {
  id: 'obf.eval-detect',
  title: 'Evaluates dynamically built code',
  defaultSeverity: 'medium',
  defaultConfidence: 'medium',
  variants: ['dynamic', 'literal'],
  subjects({ analysis }) {
    const out = []
    for (const use of analysis.evalUses) {
      if (!use.literal) out.push({ variant: 'dynamic', file: use.file, subject: use.kind })
      else if (use.literalValue !== undefined) {
        out.push({ variant: 'literal', file: use.file, subject: `${use.kind}:${subjectHash(use.literalValue)}` })
      }
    }
    return out
  },
  check({ analysis }) {
    const uses = analysis.evalUses
    if (uses.length === 0) return []
    const nonLiteral = uses.filter((use) => !use.literal)
    const literal = uses.filter((use) => use.literal)
    const findings = []
    if (nonLiteral.length > 0) {
      findings.push(
        finding(this, {
          evidence: capEvidence(
            nonLiteral.map((use) => ({
              file: use.file,
              line: use.line,
              snippet: use.snippet,
              note: `${use.kind} of a non-literal argument`,
            })),
          ),
          remediation: 'Replace eval/new Function with direct code; dynamic evaluation defeats static audit.',
          references: ['https://github.com/rogerdigital/dsh-vet/blob/main/docs/rules/obf.eval-detect.md'],
        }),
      )
    }
    if (literal.length > 0) {
      findings.push(
        finding(this, {
          title: 'Evaluates a literal string as code',
          severity: 'info',
          confidence: 'high',
          evidence: literal.map((use) => ({
            file: use.file,
            line: use.line,
            snippet: use.snippet,
            note: `${use.kind} of a constant string — inert but still eval`,
          })),
          remediation: 'Move the code out of the string literal.',
          references: ['https://github.com/rogerdigital/dsh-vet/blob/main/docs/rules/obf.eval-detect.md'],
        }),
      )
    }
    return findings
  },
}

export const dynamicRequire: Rule = {
  id: 'obf.dynamic-require',
  title: 'Loads modules through a computed specifier',
  defaultSeverity: 'medium',
  defaultConfidence: 'low',
  variants: ['recoverable', 'opaque'],
  subjects({ analysis }) {
    const out = []
    for (const use of analysis.dynamicImports) {
      if (use.literals !== null && use.literals[0]) {
        out.push({ variant: 'recoverable', file: use.file, subject: use.literals[0] })
      } else {
        out.push({ variant: 'opaque', file: use.file, subject: 'runtime-value' })
      }
    }
    return out
  },
  check({ analysis }) {
    const recoverable = analysis.dynamicImports.filter((use) => use.literals !== null)
    const opaque = analysis.dynamicImports.filter((use) => use.literals === null)
    const findings = []
    if (recoverable.length > 0) {
      findings.push(
        finding(this, {
          confidence: 'medium',
          evidence: recoverable.map((use) => ({
            file: use.file,
            line: use.line,
            snippet: use.snippet,
            note: `${use.kind} of a concatenation that statically resolves to "${use.literals![0]}"`,
          })),
          remediation: 'Use the plain specifier; concatenated module names hide the dependency from review.',
          references: ['https://github.com/rogerdigital/dsh-vet/blob/main/docs/rules/obf.dynamic-require.md'],
        }),
      )
    }
    if (opaque.length > 0) {
      findings.push(
        finding(this, {
          evidence: capEvidence(
            opaque.map((use) => ({
              file: use.file,
              line: use.line,
              snippet: use.snippet,
              note: `${use.kind} of a runtime value — the loaded module cannot be determined statically`,
            })),
          ),
          remediation: 'Use plain specifiers so the module graph stays auditable.',
          references: ['https://github.com/rogerdigital/dsh-vet/blob/main/docs/rules/obf.dynamic-require.md'],
        }),
      )
    }
    return findings
  },
}

export const encodedPayload: Rule = {
  id: 'obf.encoded-payload',
  title: 'Long base64/hex string literals in shipped code',
  defaultSeverity: 'medium',
  defaultConfidence: 'low',
  variants: ['encoded'],
  subjects({ analysis }) {
    return analysis.encodedLiterals.map((lit) => ({
      variant: 'encoded',
      file: lit.file,
      subject: `${lit.charset}:${subjectHash(lit.value)}`,
    }))
  },
  check({ analysis }) {
    const literals = analysis.encodedLiterals
    if (literals.length === 0) return []
    return [
      finding(this, {
        evidence: capEvidence(
          literals.map((lit) => ({
            file: lit.file,
            line: lit.line,
            snippet: lit.value.slice(0, 80),
            note: `${lit.charset} literal, ${lit.value.length} chars`,
          })),
        ),
        remediation: 'Decode payloads to plain assets, or ship them as files a reviewer can open.',
        references: ['https://github.com/rogerdigital/dsh-vet/blob/main/docs/rules/obf.encoded-payload.md'],
      }),
    ]
  },
}

export const charcodeChain: Rule = {
  id: 'obf.charcode-chain',
  title: 'Builds strings from character codes',
  defaultSeverity: 'medium',
  defaultConfidence: 'medium',
  variants: ['charcode'],
  subjects({ analysis }) {
    // The decoded text may embed payloads; identify it by hash, not value.
    return analysis.charcodeCalls.map((call) => ({
      variant: 'charcode',
      file: call.file,
      subject: subjectHash(call.chars),
    }))
  },
  check({ analysis }) {
    const calls = analysis.charcodeCalls
    if (calls.length === 0) return []
    return [
      finding(this, {
        evidence: calls.map((call) => ({
          file: call.file,
          line: call.line,
          note: `decodes to "${call.chars}…"`,
        })),
        remediation: 'Write the string literal directly.',
        references: ['https://github.com/rogerdigital/dsh-vet/blob/main/docs/rules/obf.charcode-chain.md'],
      }),
    ]
  },
}

export const unparseable: Rule = {
  id: 'obf.unparseable',
  title: 'Shipped JS files that no standard parser accepts',
  defaultSeverity: 'medium',
  defaultConfidence: 'high',
  variants: ['unparseable'],
  subjects({ analysis }) {
    return analysis.files
      .filter((f) => f.parseError !== null)
      .map((f) => ({ variant: 'unparseable', file: f.path, subject: 'unparseable' }))
  },
  check({ analysis }) {
    const broken = analysis.files.filter((f) => f.parseError !== null)
    if (broken.length === 0) return []
    return [
      finding(this, {
        evidence: broken.slice(0, 10).map((f) => ({
          file: f.path,
          note: `parse error: ${f.parseError?.slice(0, 120)}`,
        })),
        remediation: 'Ship parseable source, or source maps that let tooling see the real code.',
        references: ['https://github.com/rogerdigital/dsh-vet/blob/main/docs/rules/obf.unparseable.md'],
      }),
    ]
  },
}

export const obfRules: Rule[] = [evalDetect, dynamicRequire, encodedPayload, charcodeChain, unparseable]
