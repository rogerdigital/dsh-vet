// Post dsh-vet results: shields badge file, job summary, and (on PRs) one
// comment that is edited in place. Runs with Node >= 20 and zero deps, using
// only the GITHUB_TOKEN it is handed. A comment failure never fails the
// audit — it logs a warning and leaves the artifact as the source of truth.
// When a baseline was configured, the comparison section is appended to the
// summary and comment; a failed comparison never erases the scan report.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { renderBadgeJson, renderCommentMarkdown, renderComparisonMarkdown, renderComparisonUnavailableMarkdown } from './render.mjs'

const REPORT_PATH = '.dsh-vet/report.json'
const BADGE_PATH = '.dsh-vet/badge.json'
const DIFF_PATH = '.dsh-vet/diff.json'
const DIFF_ERROR_PATH = '.dsh-vet/diff-error.txt'
const MARKER = '<!-- dsh-vet:pr-comment -->'

const API_BASE = process.env.GITHUB_API_URL ?? 'https://api.github.com'

function api(path, init, token) {
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...init.headers,
    },
  })
}

async function upsertComment(markdown) {
  const { GITHUB_REPOSITORY, GH_TOKEN, PR_NUMBER } = process.env
  if (process.env.COMMENT_ENABLED === 'false') return // action input `comment: false`
  if (!GITHUB_REPOSITORY || !GH_TOKEN || !PR_NUMBER) return
  try {
    const comments = await (
      await api(`/repos/${GITHUB_REPOSITORY}/issues/${PR_NUMBER}/comments`, {}, GH_TOKEN)
    ).json()
    const existing = (Array.isArray(comments) ? comments : []).find((c) => c.body?.includes(MARKER))
    if (existing) {
      await api(
        `/repos/${GITHUB_REPOSITORY}/issues/comments/${existing.id}`,
        { method: 'PATCH', body: JSON.stringify({ body: markdown }) },
        GH_TOKEN,
      )
    } else {
      await api(
        `/repos/${GITHUB_REPOSITORY}/issues/${PR_NUMBER}/comments`,
        { method: 'POST', body: JSON.stringify({ body: markdown }) },
        GH_TOKEN,
      )
    }
  } catch (err) {
    console.warn(`dsh-vet: PR comment failed (${err.message}); the report artifact remains the source of truth`)
  }
}

const summaryFile = process.env.GITHUB_STEP_SUMMARY
const runUrl = process.env.RUN_URL ?? '(run url unavailable)'
const baselineConfigured = Boolean(process.env.BASELINE_REPORT)

/** The comparison section for a configured baseline, or null in scan-only mode. */
function readComparisonSection() {
  if (!baselineConfigured) return null
  try {
    const diff = JSON.parse(readFileSync(DIFF_PATH, 'utf8'))
    if (diff && diff.schema === 'dsh-vet/diff/v1') return renderComparisonMarkdown(diff, { runUrl })
  } catch {
    // fall through to the unavailable rendering
  }
  let reason = 'no comparison result was produced'
  try {
    if (existsSync(DIFF_ERROR_PATH)) {
      reason = readFileSync(DIFF_ERROR_PATH, 'utf8').trim() || reason
    }
  } catch {
    // keep the default reason
  }
  return renderComparisonUnavailableMarkdown(reason)
}

// The report file exists but may be empty (the scan redirect creates it
// before the scanner runs); an unreadable report must degrade to the
// did-not-complete path, never crash the step.
let report = null
try {
  if (existsSync(REPORT_PATH)) report = JSON.parse(readFileSync(REPORT_PATH, 'utf8'))
} catch {
  report = null
}

if (!report || report.schema !== 'dsh-vet/v1') {
  let msg = `## dsh-vet report\n\nThe scan did not complete — no valid report was produced. See the [run](${runUrl}) logs for the scanner error.`
  if (baselineConfigured) {
    msg += '\n\nThe configured baseline comparison did not run — no report was produced.'
  }
  if (summaryFile) writeFileSync(summaryFile, msg + '\n', { flag: 'a' })
  await upsertComment(msg)
  process.exit(0)
}

writeFileSync(BADGE_PATH, JSON.stringify(renderBadgeJson(report)))

const comparison = readComparisonSection()
const markdown = comparison
  ? renderCommentMarkdown(report, { runUrl }) + '\n\n' + comparison
  : renderCommentMarkdown(report, { runUrl })
if (summaryFile) writeFileSync(summaryFile, markdown + '\n', { flag: 'a' })
await upsertComment(markdown)
