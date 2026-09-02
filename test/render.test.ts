import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { renderMarkdown } from '../src/render.ts'
import { renderCommentMarkdown } from '../action/scripts/render.mjs'
import type { VetReport } from '../src/contract.ts'

const kitchenSink = JSON.parse(
  readFileSync(new URL('../fixtures/offender-kitchen-sink/expected.report.json', import.meta.url), 'utf8'),
) as VetReport

const RUN_URL = 'https://github.com/example/example/actions/runs/1'

describe('renderMarkdown', () => {
  it('renders grade, counts, and the upsert marker', () => {
    const md = renderMarkdown(kitchenSink, { runUrl: RUN_URL })
    expect(md).toContain('<!-- dsh-vet:pr-comment -->')
    expect(md).toContain('**Grade: D**')
    expect(md).toContain('| 0 | 2 | 8 | 1 | 3 |')
    expect(md).toContain(`[run](${RUN_URL})`)
  })
})

describe('renderMarkdown stays identical to the action renderer', () => {
  // action/scripts/render.mjs is the dependency-free copy the composite
  // action ships; this file must not drift from it.
  const ROOT = fileURLToPath(new URL('..', import.meta.url))
  const reports = readdirSync(join(ROOT, 'fixtures'), { recursive: true })
    .filter((f) => String(f).endsWith('expected.report.json'))
    .map((f) => JSON.parse(readFileSync(join(ROOT, 'fixtures', String(f)), 'utf8')) as VetReport)

  it('byte-identical output for every fixture report', () => {
    for (const report of reports) {
      expect(renderMarkdown(report, { runUrl: RUN_URL })).toBe(
        renderCommentMarkdown(report, { runUrl: RUN_URL }),
      )
    }
  })
})
