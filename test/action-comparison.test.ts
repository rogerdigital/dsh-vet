import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  escapeMarkdown,
  renderComparisonMarkdown,
  renderComparisonUnavailableMarkdown,
} from '../action/scripts/render.mjs'
import { scanDirectory } from '../src/scanner.ts'
import { compareReports } from '../src/compare.ts'

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', 'action', 'scripts', 'post-results.mjs')
const FIXTURES_DIR = fileURLToPath(new URL('../fixtures', import.meta.url))
const RUN_URL = 'https://github.com/example/example/actions/runs/1'

function workdir(): string {
  const work = mkdtempSync(join(tmpdir(), 'dsh-vet-cmp-act-'))
  mkdirSync(join(work, '.dsh-vet'), { recursive: true })
  return work
}

async function comparableDiffFiles(): Promise<{ diff: object; headReport: object }> {
  const baseDir = mkdtempSync(join(tmpdir(), 'dsh-vet-cmp-base-'))
  const headDir = mkdtempSync(join(tmpdir(), 'dsh-vet-cmp-head-'))
  try {
    const pkg = '{"name":"cmp-demo","main":"index.js"}'
    writeFileSync(join(baseDir, 'package.json'), pkg)
    writeFileSync(join(baseDir, 'index.js'), "await fetch('https://a.example.com/x')")
    writeFileSync(join(headDir, 'package.json'), pkg)
    writeFileSync(
      join(headDir, 'index.js'),
      "await fetch('https://a.example.com/x')\nawait fetch('https://b.example.com/y')",
    )
    const now = () => '2026-01-01T00:00:00.000Z'
    const base = await scanDirectory(baseDir, { now })
    const head = await scanDirectory(headDir, { now })
    return { diff: compareReports(base, head), headReport: head }
  } finally {
    rmSync(baseDir, { recursive: true, force: true })
    rmSync(headDir, { recursive: true, force: true })
  }
}

function runPostResults(work: string, env: NodeJS.ProcessEnv) {
  return spawnSync('node', [SCRIPT], {
    cwd: work,
    env: { ...process.env, ...env },
  })
}

describe('renderComparisonMarkdown', () => {
  it('summarizes a comparable diff with bounded added behavior and the artifact link', async () => {
    const { diff } = await comparableDiffFiles()
    const md = renderComparisonMarkdown(diff as never, { runUrl: RUN_URL })
    expect(md).toContain('### dsh-vet release comparison')
    expect(md).toContain('**Comparison: comparable**')
    expect(md).toContain('b.example.com')
    expect(md).toContain('secondary context')
    expect(md).toContain(RUN_URL)
  })

  it('discloses truncation beyond ten added findings', () => {
    const added = Array.from({ length: 13 }, (_, i) => ({
      rule: 'egress.outbound-endpoints',
      file: 'index.js',
      subject: `host${i}.example.com`,
    }))
    const md = renderComparisonMarkdown(
      {
        comparability: 'comparable',
        reasons: [],
        base: { grade: 'A' },
        head: { grade: 'A' },
        findings: { added, removed: [], changed: [] },
        observations: { added: [] },
      } as never,
      { runUrl: RUN_URL },
    )
    expect(md).toContain('- …and 3 more findings (truncated here; see the diff artifact)')
  })

  it('explains incomparable results without any nothing-changed claim', () => {
    const md = renderComparisonMarkdown(
      {
        comparability: 'incomparable',
        reasons: ['profile-mismatch', 'coverage-partial-base'],
        base: { grade: 'A' },
        head: { grade: 'A' },
      } as never,
      { runUrl: RUN_URL },
    )
    expect(md).toContain('**Comparison unavailable**')
    expect(md).toContain('`profile-mismatch`')
    expect(md).toContain('never a claim that nothing changed')
  })

  it('escapes untrusted markdown content in identities', () => {
    const md = renderComparisonMarkdown(
      {
        comparability: 'comparable',
        reasons: [],
        base: { grade: 'A' },
        head: { grade: 'A' },
        findings: {
          added: [{ rule: 'x.y', file: '<img src=x>.js', subject: 'host`injection' }],
          removed: [],
          changed: [],
        },
        observations: { added: [] },
      } as never,
      { runUrl: RUN_URL },
    )
    expect(md).not.toContain('<img')
    expect(md).toContain('&lt;img src=x&gt;.js')
    expect(md).not.toContain('`injection')
  })
})

describe('escapeMarkdown and the unavailable rendering', () => {
  it('strips control characters and escapes metacharacters', () => {
    expect(escapeMarkdown('a\u0000b\u001bc')).toBe('abc')
    expect(escapeMarkdown('a&<b>')).toBe('a&amp;&lt;b&gt;')
    expect(escapeMarkdown('code`block`')).toBe("code'block'")
  })

  it('bounds the reason text and explains recovery', () => {
    const md = renderComparisonUnavailableMarkdown(`${'x'.repeat(600)}\u0007`)
    expect(md).toContain('the configured baseline could not be used')
    expect(md).toContain('(truncated)')
    expect(md).toContain('unset `baseline-report`')
  })
})

describe('post-results with a configured baseline', () => {
  it('appends the comparison section to the summary from a real diff', async () => {
    const work = workdir()
    try {
      const { diff, headReport } = await comparableDiffFiles()
      writeFileSync(join(work, '.dsh-vet', 'report.json'), JSON.stringify(headReport))
      writeFileSync(join(work, '.dsh-vet', 'diff.json'), JSON.stringify(diff))
      const summary = join(work, 'summary.md')
      const result = runPostResults(work, {
        COMMENT_ENABLED: 'false',
        BASELINE_REPORT: '/tmp/base.report.json',
        GITHUB_STEP_SUMMARY: summary,
        RUN_URL: RUN_URL,
      })
      expect(result.status).toBe(0)
      const text = readFileSync(summary, 'utf8')
      expect(text).toContain('## dsh-vet report')
      expect(text).toContain('### dsh-vet release comparison')
      expect(text).toContain('b.example.com')
      expect(readFileSync(join(work, '.dsh-vet', 'badge.json'), 'utf8')).toContain('grade')
    } finally {
      rmSync(work, { recursive: true, force: true })
    }
  })

  it('renders why comparison is unavailable when only diagnostics exist', () => {
    const work = workdir()
    try {
      writeFileSync(
        join(work, '.dsh-vet', 'report.json'),
        readFileSync(join(FIXTURES_DIR, 'clean-seams-declared', 'expected.report.json')),
      )
      writeFileSync(
        join(work, '.dsh-vet', 'diff-error.txt'),
        'dsh-vet diff: /tmp/base.report.json is not a valid dsh-vet/v1 report:\n  summary.grade: mismatch',
      )
      const summary = join(work, 'summary.md')
      const result = runPostResults(work, {
        COMMENT_ENABLED: 'false',
        BASELINE_REPORT: '/tmp/base.report.json',
        GITHUB_STEP_SUMMARY: summary,
        RUN_URL: RUN_URL,
      })
      expect(result.status).toBe(0)
      const text = readFileSync(summary, 'utf8')
      expect(text).toContain('the configured baseline could not be used')
      expect(text).toContain('summary.grade')
      expect(text).toContain('The scan report itself is unaffected')
    } finally {
      rmSync(work, { recursive: true, force: true })
    }
  })

  it('stays scan-only without a baseline: no comparison section anywhere', () => {
    const work = workdir()
    try {
      writeFileSync(
        join(work, '.dsh-vet', 'report.json'),
        readFileSync(join(FIXTURES_DIR, 'clean-seams-declared', 'expected.report.json')),
      )
      const summary = join(work, 'summary.md')
      const result = runPostResults(work, {
        COMMENT_ENABLED: 'false',
        GITHUB_STEP_SUMMARY: summary,
        RUN_URL: RUN_URL,
      })
      expect(result.status).toBe(0)
      expect(readFileSync(summary, 'utf8')).not.toContain('release comparison')
    } finally {
      rmSync(work, { recursive: true, force: true })
    }
  })

  it('notes that the comparison did not run when no report was produced', () => {
    const work = workdir()
    try {
      writeFileSync(join(work, '.dsh-vet', 'report.json'), '')
      const summary = join(work, 'summary.md')
      const result = runPostResults(work, {
        COMMENT_ENABLED: 'false',
        BASELINE_REPORT: '/tmp/base.report.json',
        GITHUB_STEP_SUMMARY: summary,
        RUN_URL: RUN_URL,
      })
      expect(result.status).toBe(0)
      expect(readFileSync(summary, 'utf8')).toContain('The scan did not complete')
      expect(readFileSync(summary, 'utf8')).toContain('The configured baseline comparison did not run')
    } finally {
      rmSync(work, { recursive: true, force: true })
    }
  })

  it('a comment failure never erases the report, badge, or comparison summary', async () => {
    const work = workdir()
    try {
      const { diff, headReport } = await comparableDiffFiles()
      writeFileSync(join(work, '.dsh-vet', 'report.json'), JSON.stringify(headReport))
      writeFileSync(join(work, '.dsh-vet', 'diff.json'), JSON.stringify(diff))
      const summary = join(work, 'summary.md')
      // Fork-style environment: PR number and token present, but the API is
      // unreachable — the comment must fail loudly and change nothing else.
      const result = runPostResults(work, {
        COMMENT_ENABLED: 'true',
        GITHUB_REPOSITORY: 'example/example',
        GH_TOKEN: 'definitely-not-a-token',
        PR_NUMBER: '7',
        GITHUB_API_URL: 'http://127.0.0.1:1',
        BASELINE_REPORT: '/tmp/base.report.json',
        GITHUB_STEP_SUMMARY: summary,
        RUN_URL: RUN_URL,
      })
      expect(result.status).toBe(0)
      expect(result.stderr.toString()).toContain('PR comment failed')
      expect(readFileSync(summary, 'utf8')).toContain('release comparison')
      expect(readFileSync(join(work, '.dsh-vet', 'badge.json'), 'utf8')).toContain('grade')
    } finally {
      rmSync(work, { recursive: true, force: true })
    }
  })
})
