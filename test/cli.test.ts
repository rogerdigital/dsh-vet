import { describe, expect, it } from 'vitest'
import { runCli } from '../src/cli.ts'

const FIXTURES = new URL('../fixtures', import.meta.url).pathname

function io() {
  const out: string[] = []
  const err: string[] = []
  return {
    stdout: (line: string) => out.push(line),
    stderr: (line: string) => err.push(line),
    out,
    err,
  }
}

describe('runCli', () => {
  it('prints a human summary and exits 0 on a completed report', async () => {
    const stream = io()
    const code = await runCli([`${FIXTURES}/clean-seams-declared`], stream)
    expect(code).toBe(0)
    expect(stream.out.join('\n')).toContain('grade: A')
    expect(stream.out.join('\n')).toContain('egress.outbound-endpoints')
  })

  it('emits a dsh-vet/v1 JSON report with --json', async () => {
    const stream = io()
    const code = await runCli(['--json', `${FIXTURES}/offender-kitchen-sink`], stream)
    expect(code).toBe(0)
    const report = JSON.parse(stream.out.join('\n'))
    expect(report.schema).toBe('dsh-vet/v1')
    expect(report.summary.grade).toBe('D')
  })

  it('exits 1 under --strict when high+medium findings exist', async () => {
    const stream = io()
    const code = await runCli(['--strict', `${FIXTURES}/offender-kitchen-sink`], stream)
    expect(code).toBe(1)
    expect(stream.err.join('\n')).toContain('threshold breached')
  })

  it('exits 0 under --strict on a clean plugin', async () => {
    const stream = io()
    const code = await runCli(['--strict', `${FIXTURES}/clean-seams-declared`], stream)
    expect(code).toBe(0)
  })

  it('honors --fail-on overrides', async () => {
    const medium = io()
    expect(await runCli(['--fail-on', 'critical', `${FIXTURES}/offender-kitchen-sink`], medium)).toBe(0)
    const low = io()
    expect(await runCli(['--fail-on', 'medium', `${FIXTURES}/offender-kitchen-sink`], low)).toBe(1)
    const invalid = io()
    expect(await runCli(['--fail-on', 'bananas', `${FIXTURES}/clean-seams-declared`], invalid)).toBe(2)
  })

  it('filters rules with --rules', async () => {
    const stream = io()
    const code = await runCli(['--json', '--rules', 'dep.install-scripts', `${FIXTURES}/offender-kitchen-sink`], stream)
    expect(code).toBe(0)
    const report = JSON.parse(stream.out.join('\n'))
    expect(report.findings.map((f: { id: string }) => f.id)).toEqual(['dep.install-scripts'])
  })

  it('fails with exit 2 on usage and scanner errors', async () => {
    expect(await runCli([], io())).toBe(2)
    expect(await runCli(['a', 'b'], io())).toBe(2)
    const stream = io()
    expect(await runCli(['/definitely/not/here',], stream)).toBe(2)
    expect(stream.err.join('\n')).toContain('not a directory')
  })

  it('prints version and help', async () => {
    const version = io()
    expect(await runCli(['--version'], version)).toBe(0)
    expect(version.out[0]).toMatch(/^\d+\.\d+\.\d+$/)
    const help = io()
    expect(await runCli(['--help'], help)).toBe(0)
    expect(help.out.join('\n')).toContain('usage: dsh-vet')
  })
})
