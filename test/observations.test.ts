import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { analyze } from '../src/analyze.ts'
import { runRules } from '../src/rules/index.ts'
import { deriveFindingIdentities, deriveObservations, normalizeHost, subjectHash } from '../src/observations.ts'
import { RULES } from '../src/rules/index.ts'

function fixture(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-vet-obs-'))
  for (const [path, content] of Object.entries(files)) {
    const abs = join(dir, path)
    mkdirSync(join(abs, '..'), { recursive: true })
    writeFileSync(abs, content)
  }
  return dir
}

function scanOf(files: Record<string, string>) {
  const dir = fixture(files)
  try {
    const analysis = analyze(dir)
    const findings = runRules(analysis)
    const emptyAuditRan = analysis.files.length === 0
    return {
      analysis,
      findings,
      observations: deriveObservations(analysis),
      identities: deriveFindingIdentities(analysis, findings, RULES, { emptyAuditRan }),
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('normalizeHost', () => {
  it('drops credentials, queries, and paths while keeping the port', () => {
    expect(normalizeHost('https://user:pass@collector.example:8443/v1/collect?token=XYZ')).toBe('collector.example:8443')
    expect(normalizeHost('https://api.example.com/v1/status')).toBe('api.example.com')
    // The default port is the same destination as no port: normalized away.
    expect(normalizeHost('http://api.example.com:80/x')).toBe('api.example.com')
    expect(normalizeHost('http://api.example.com:8080/x')).toBe('api.example.com:8080')
    expect(normalizeHost('collector.example/collect?apikey=1')).toBe('collector.example')
    expect(normalizeHost('user:pass@bare.example/path')).toBe('bare.example')
  })

  it('returns null when nothing host-like remains', () => {
    expect(normalizeHost('/local/path')).toBeNull()
    expect(normalizeHost('?q=1')).toBeNull()
  })
})

describe('deriveObservations', () => {
  it('emits capabilities, outbound hosts, install scripts, and sensitive reads', () => {
    const { observations } = scanOf({
      'package.json': '{"name":"m","main":"index.js","scripts":{"postinstall":"node setup.js"}}',
      'index.js': [
        "import fs from 'node:fs'",
        "import cp from 'node:child_process'",
        'const cfg = fs.readFileSync("/tmp/dsh/.env.local")',
        "cp.execSync('ls')",
        "await fetch('https://api.example.com/v1/status')",
        'await fetch("https://collector.example:8443/collect?token=XYZ")',
      ].join('\n'),
    })
    const subjects = (kind: string) =>
      observations.filter((o) => o.kind === kind).map((o) => `${o.file} ${o.subject}`)
    expect(subjects('capability')).toContain('index.js fs')
    expect(subjects('capability')).toContain('index.js shell')
    expect(subjects('outbound-host')).toEqual([
      'index.js api.example.com',
      'index.js collector.example:8443',
    ])
    expect(subjects('install-script')).toEqual(['package.json postinstall'])
    expect(subjects('sensitive-read')).toContain('index.js /tmp/dsh/.env.local')
  })

  it('counts repeated identical observations instead of repeating entries', () => {
    const { observations } = scanOf({
      'package.json': '{"name":"m","main":"index.js"}',
      'index.js': [
        "await fetch('https://api.example.com/v1/a')",
        "await fetch('https://api.example.com/v1/b')",
        "await fetch('https://api.example.com:443/v1/c')",
      ].join('\n'),
    })
    const host = observations.find((o) => o.kind === 'outbound-host')!
    expect(host.count).toBe(3)
    expect(observations.filter((o) => o.kind === 'outbound-host').length).toBe(1)
  })

  it('never carries credentials or query values into subjects', () => {
    const { observations } = scanOf({
      'package.json': '{"name":"m","main":"index.js"}',
      'index.js': "await fetch('https://token:SECRETPASSWORD@collector.example/v1?apikey=TOPSECRET')",
    })
    const serialized = JSON.stringify(observations)
    expect(serialized).not.toContain('SECRETPASSWORD')
    expect(serialized).not.toContain('TOPSECRET')
    expect(serialized).not.toContain('token:')
    expect(observations).toEqual([
      { kind: 'capability', file: 'index.js', subject: 'net' },
      { kind: 'outbound-host', file: 'index.js', subject: 'collector.example' },
    ])
  })
})

describe('deriveFindingIdentities', () => {
  it('exposes per-subject identities so a second host is detectable', () => {
    const one = scanOf({
      'package.json': '{"name":"m","main":"index.js"}',
      'index.js': "await fetch('https://a.example.com/x')",
    })
    const two = scanOf({
      'package.json': '{"name":"m","main":"index.js"}',
      'index.js': "await fetch('https://a.example.com/x')\nawait fetch('https://b.example.com/y')",
    })
    const identityOf = (scan: ReturnType<typeof scanOf>) =>
      scan.identities.map((i) => `${i.rule}|${i.variant}|${i.file}|${i.subject}`)
    expect(identityOf(two).length - identityOf(one).length).toBeGreaterThan(0)
    expect(identityOf(two)).toContain('egress.outbound-endpoints|endpoints|index.js|b.example.com')
    expect(identityOf(one)).not.toContain('egress.outbound-endpoints|endpoints|index.js|b.example.com')
  })

  it('is stable under line insertion and formatting changes', () => {
    const before = scanOf({
      'package.json': '{"name":"m","main":"index.js"}',
      'index.js': [
        "const fs = require('node:fs')",
        'fs.writeFileSync("/etc/crontab", "x")',
        "eval(process.argv[1])",
      ].join('\n'),
    })
    const after = scanOf({
      'package.json': '{"name":"m","main":"index.js"}',
      'index.js': [
        '// a comment inserted above everything',
        '',
        "const fs = require( 'node:fs' ) ;",
        'fs.writeFileSync( "/etc/crontab" , "x" )',
        'eval( process.argv [ 1 ] )',
      ].join('\n'),
    })
    expect(after.identities).toEqual(before.identities)
    expect(before.identities.map((i) => `${i.rule}|${i.variant}|${i.subject}`)).toEqual(
      expect.arrayContaining([
        'perm.undeclared-fs-write|out-of-scope|/etc/crontab',
        'obf.eval-detect|dynamic|eval',
      ]),
    )
  })

  it('counts repeated identical eval sites instead of listing them twice', () => {
    const once = scanOf({
      'package.json': '{"name":"m","main":"index.js"}',
      'index.js': 'eval(process.argv[1])',
    })
    const twice = scanOf({
      'package.json': '{"name":"m","main":"index.js"}',
      'index.js': 'eval(process.argv[1])\neval(process.argv[2])',
    })
    const dynamic = (scan: ReturnType<typeof scanOf>) =>
      scan.identities.find((i) => i.rule === 'obf.eval-detect' && i.variant === 'dynamic')!
    expect(dynamic(once).count).toBeUndefined()
    expect(dynamic(twice).count).toBe(2)
  })

  it('identifies literal eval content by hash, never by value', () => {
    const { identities, analysis } = scanOf({
      'package.json': '{"name":"m","main":"index.js"}',
      'index.js': "eval('console.log(\"PAYLOAD_SECRET_VALUE\")')",
    })
    const literal = identities.find((i) => i.rule === 'obf.eval-detect' && i.variant === 'literal')!
    expect(literal.subject).toBe(`eval:${subjectHash(analysis.evalUses[0]!.literalValue ?? '')}`)
    expect(JSON.stringify(identities)).not.toContain('PAYLOAD_SECRET_VALUE')
  })

  it('keeps identities aligned with emitted findings for every shipped rule', () => {
    // The kitchen-sink style target triggers many rules at once; alignment
    // means every rule with findings contributes identities.
    const { findings, identities } = scanOf({
      'package.json': JSON.stringify({
        name: 'm',
        main: 'index.js',
        dependencies: { 'dsh-vaultt': '*', 'left-pad': '^1.0.0' },
        scripts: { postinstall: 'node setup.js' },
        dsh: { seams: ['fs'] },
      }),
      'index.js': [
        "const fs = require('node:fs')",
        "const cp = require('node:child_process')",
        "const os = require('node:os')",
        'fs.writeFileSync("/etc/hosts", "x")',
        'fs.rm(target)',
        'const secret = fs.readFileSync(`${os.homedir()}/.dsh/credentials`)',
        "cp.exec('ls')",
        "await fetch('https://api.example.com/v1')",
        'eval(process.argv[1])',
        'eval("console.log(1)")',
        "require('./' + name)",
        'const big = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"',
        'String.fromCharCode(104,101,108,108,111,32,119,111,114,108,100)',
      ].join('\n'),
      'orphan.js': 'export const dead = 1',
      'broken.js': 'function {{{',
    })
    const rulesWithFindings = new Set(findings.map((f) => f.id))
    const rulesWithIdentities = new Set(identities.map((i) => i.rule))
    expect(rulesWithFindings).not.toContain('scan.empty-audit')
    for (const id of rulesWithFindings) {
      expect(rulesWithIdentities, id).toContain(id)
    }
  })

  it('includes the empty-audit identity when the automatic check fires', () => {
    const dir = fixture({ 'package.json': '{"name":"ts-only","main":"dist/index.js"}' })
    try {
      mkdirSync(join(dir, 'src'))
      writeFileSync(join(dir, 'src', 'index.ts'), 'export const x = 1')
      const analysis = analyze(dir)
      const findings = runRules(analysis)
      const identities = deriveFindingIdentities(analysis, findings, RULES, { emptyAuditRan: true })
      expect(identities).toEqual([
        { rule: 'scan.empty-audit', variant: 'audit', file: '.', subject: 'no-analyzable-javascript' },
      ])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
