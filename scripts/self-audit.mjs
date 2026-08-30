// Self-audit (ROADMAP T6): pack dsh-vet exactly as it would ship, then scan
// that tarball through the standard npm resolution path (metadata + integrity
// verification) and print the report.
//
//   SCAN_AT=<rfc3339> node scripts/self-audit.mjs > examples/dsh-vet.report.json
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scan } from '../lib/index.mjs'

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const work = mkdtempSync(join(tmpdir(), 'dsh-vet-selfaudit-'))
try {
  execFileSync('npm', ['pack', '--pack-destination', work], { stdio: 'ignore' })
  const tarballName = readdirSync(work).find((f) => f.endsWith('.tgz'))
  const tarball = readFileSync(join(work, tarballName))
  const integrity = `sha512-${createHash('sha512').update(tarball).digest('base64')}`
  const tarballUrl = 'https://registry.example/self-audit.tgz'
  const packument = {
    'dist-tags': { latest: pkg.version },
    versions: {
      [pkg.version]: { version: pkg.version, dist: { tarball: tarballUrl, integrity } },
    },
  }
  const fetchImpl = async (url) =>
    url === tarballUrl
      ? { ok: true, status: 200, arrayBuffer: async () => tarball }
      : { ok: true, status: 200, json: async () => packument }

  const report = await scan(`${pkg.name}@${pkg.version}`, {
    fetchImpl,
    registry: 'https://registry.example',
    now: () => process.env.SCAN_AT ?? new Date().toISOString(),
  })
  console.log(JSON.stringify(report, null, 2))
} finally {
  rmSync(work, { recursive: true, force: true })
}
