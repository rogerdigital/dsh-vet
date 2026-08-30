import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { renderBadge } from '../src/badge.ts'
import type { VetReport } from '../src/contract.ts'
import { runCli } from '../src/cli.ts'

const kitchenSink = JSON.parse(
  readFileSync(new URL('../fixtures/offender-kitchen-sink/expected.report.json', import.meta.url), 'utf8'),
) as VetReport

describe('renderBadge', () => {
  it('maps grades to shields colors', () => {
    const at = (grade: string, report = kitchenSink) => renderBadge({ ...report, summary: { ...report.summary, grade: grade as never } })
    expect(at('A')).toMatchObject({ schemaVersion: 1, label: 'dsh-vet', message: 'grade A', color: 'brightgreen' })
    expect(at('B').color).toBe('green')
    expect(at('C').color).toBe('yellow')
    expect(at('D').color).toBe('orange')
    expect(at('F').color).toBe('red')
    expect(at('X')).toMatchObject({ message: 'scan failed', color: 'lightgrey', isError: true })
  })
})

describe('runCli badge', () => {
  const FIXTURES = new URL('../fixtures', import.meta.url).pathname

  function io() {
    const out: string[] = []
    const err: string[] = []
    return { stdout: (l: string) => out.push(l), stderr: (l: string) => err.push(l), out, err }
  }

  it('emits shields endpoint JSON for a valid report', async () => {
    const stream = io()
    const code = await runCli(['badge', `${FIXTURES}/offender-kitchen-sink/expected.report.json`], stream)
    expect(code).toBe(0)
    expect(JSON.parse(stream.out[0]!)).toEqual({
      schemaVersion: 1,
      label: 'dsh-vet',
      message: 'grade D',
      color: 'orange',
    })
  })

  it('rejects files that are not dsh-vet/v1 reports', async () => {
    const stream = io()
    const code = await runCli(['badge', `${FIXTURES}/offender-kitchen-sink/package.json`], stream)
    expect(code).toBe(2)
    expect(stream.err.join('\n')).toContain('not a dsh-vet/v1 report')
  })

  it('rejects missing arguments and missing files', async () => {
    expect(await runCli(['badge'], io())).toBe(2)
    const stream = io()
    expect(await runCli(['badge', '/nope/missing.json'], stream)).toBe(2)
    expect(stream.err.join('\n')).toContain('cannot read report')
  })
})
