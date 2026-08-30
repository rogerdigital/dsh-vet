// Post dsh-vet results: shields badge file, job summary, and (on PRs) one
// comment that is edited in place. Runs with Node >= 20 and zero deps, using
// only the GITHUB_TOKEN it is handed. A comment failure never fails the
// audit — it logs a warning and leaves the artifact as the source of truth.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { renderBadgeJson, renderCommentMarkdown } from './render.mjs'

const REPORT_PATH = '.dsh-vet/report.json'
const BADGE_PATH = '.dsh-vet/badge.json'
const MARKER = '<!-- dsh-vet:pr-comment -->'

function api(path, init, token) {
  return fetch(`https://api.github.com${path}`, {
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
const report = existsSync(REPORT_PATH) ? JSON.parse(readFileSync(REPORT_PATH, 'utf8')) : null

if (!report || report.schema !== 'dsh-vet/v1') {
  const msg = `## dsh-vet report\n\nThe scan did not complete — no valid report was produced. See the [run](${runUrl}) logs for the scanner error.`
  if (summaryFile) writeFileSync(summaryFile, msg + '\n', { flag: 'a' })
  await upsertComment(msg)
  process.exit(0)
}

writeFileSync(BADGE_PATH, JSON.stringify(renderBadgeJson(report)))

const markdown = renderCommentMarkdown(report, { runUrl })
if (summaryFile) writeFileSync(summaryFile, markdown + '\n', { flag: 'a' })
await upsertComment(markdown)
