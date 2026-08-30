import { execFileSync } from 'node:child_process'
import { readFileSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { renderBadgeJson, renderCommentMarkdown } from '../action/scripts/render.mjs'
import type { VetReport } from '../src/contract.ts'

const kitchenSink = JSON.parse(
  readFileSync(new URL('../fixtures/offender-kitchen-sink/expected.report.json', import.meta.url), 'utf8'),
) as VetReport
const clean = JSON.parse(
  readFileSync(new URL('../fixtures/clean-seams-declared/expected.report.json', import.meta.url), 'utf8'),
) as VetReport

describe('renderBadgeJson', () => {
  it('matches the CLI badge rendering', () => {
    expect(renderBadgeJson(kitchenSink)).toEqual({
      schemaVersion: 1,
      label: 'dsh-vet',
      message: 'grade D',
      color: 'orange',
    })
    expect(renderBadgeJson(clean).message).toBe('grade A')
  })
})

describe('renderCommentMarkdown', () => {
  it('carries the edit-in-place marker, grade, and counts', () => {
    const md = renderCommentMarkdown(kitchenSink, { runUrl: 'https://example/run/1' })
    expect(md).toContain('<!-- dsh-vet:pr-comment -->')
    expect(md).toContain('**Grade: D**')
    expect(md).toContain('| 0 | 2 | 8 | 1 | 3 |')
    expect(md).toContain('[run](https://example/run/1)')
  })

  it('lists graded findings with evidence, collapses info findings', () => {
    const md = renderCommentMarkdown(kitchenSink, { runUrl: 'https://r' })
    expect(md).toContain('**[H] perm.undeclared-fs-write**')
    expect(md).toMatch(/- `[a-z./-]+:\d+`/)
    expect(md).toContain('<details><summary>3 info findings')
  })

  it('renders a report with no graded findings cleanly', () => {
    const md = renderCommentMarkdown(clean, { runUrl: 'https://r' })
    expect(md).toContain('**Grade: A**')
    expect(md).not.toContain('### Findings')
    expect(md).toContain('2 info findings')
  })

  it('renders an empty report with an explicit no-findings line', () => {
    const empty = {
      ...clean,
      summary: { grade: 'A', counts: { critical: 0, high: 0, medium: 0, low: 0, info: 0 } },
      findings: [],
    }
    const md = renderCommentMarkdown(empty, { runUrl: 'https://r' })
    expect(md).toContain('No findings.')
  })
})

describe('post-results script', () => {
  it('degrades gracefully when the report file exists but is empty', () => {
    const script = join(dirname(fileURLToPath(import.meta.url)), '..', 'action', 'scripts', 'post-results.mjs')
    const work = mkdtempSync(join(tmpdir(), 'dsh-vet-post-'))
    try {
      mkdirSync(join(work, '.dsh-vet'), { recursive: true })
      writeFileSync(join(work, '.dsh-vet', 'report.json'), '')
      // The scan redirect creates the file before the scanner runs; an empty
      // report must take the did-not-complete path, never crash the step.
      execFileSync('node', [script], { cwd: work, stdio: 'pipe' })
    } finally {
      rmSync(work, { recursive: true, force: true })
    }
  })
})
