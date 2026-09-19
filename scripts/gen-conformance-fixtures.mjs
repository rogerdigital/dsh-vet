// Regenerate the committed conformance reports (docs/consumer-conformance.md):
//
//   pnpm build && node scripts/gen-conformance-fixtures.mjs
//
// Valid reports are real scans of golden-locked fixtures; forged/future
// variants are minimal mutations of those scans. Regenerate deliberately
// and review the diff — these files are the public conformance kit.
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { scanDirectory } from '../lib/index.mjs'

const FIX = (name) => fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url))
const OUT_DIR = fileURLToPath(new URL('../test/fixtures/conformance', import.meta.url))
const OUT = (name) => `${OUT_DIR}/${name}`
const FIXED_NOW = () => '2026-01-01T00:00:00.000Z'

mkdirSync(OUT_DIR, { recursive: true })

function placeholder(report, label) {
  return { ...report, target: { ...report.target, specifier: `<conformance:${label}>` } }
}

function write(name, report) {
  writeFileSync(OUT(name), JSON.stringify(report, null, 2) + '\n')
}

const clean = placeholder(await scanDirectory(FIX('clean-seams-declared'), { now: FIXED_NOW }), 'extension-v1')
write('extension-v1.report.json', clean)

const legacy = structuredClone(clean)
delete legacy['x-dsh-vet']
write('legacy-minimal.report.json', legacy)

const future = structuredClone(clean)
future['x-dsh-vet'].version = 2
write('future-extension.report.json', future)

const partial = placeholder(await scanDirectory(FIX('unreachable-unparseable'), { now: FIXED_NOW }), 'partial-coverage')
write('partial-coverage.report.json', partial)

const forged = structuredClone(partial)
forged.summary.grade = 'A' // the real derived grade is C
write('forged-summary.report.json', forged)

const pairBase = placeholder(
  await scanDirectory(FIX('clean-seams-declared'), { now: () => '2026-01-02T00:00:00.000Z' }),
  'pair-a-base',
)
write('pair-a-base.report.json', pairBase)

const pairHead = placeholder(
  await scanDirectory(FIX('clean-seams-declared'), { now: () => '2026-01-03T00:00:00.000Z' }),
  'pair-a-head',
)
write('pair-a-head.report.json', pairHead)

const pairSubset = placeholder(
  await scanDirectory(FIX('clean-seams-declared'), { now: FIXED_NOW, rules: ['perm.network-client'] }),
  'pair-b-head',
)
write('pair-b-head.report.json', pairSubset)
