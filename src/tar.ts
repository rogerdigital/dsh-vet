/**
 * Minimal tar reader for npm pack tarballs (ustar + PAX + GNU longname).
 *
 * Hand-rolled on purpose: it keeps `acorn` the only runtime dependency that is
 * not Node itself (ROADMAP D4), and npm tarballs need only a small, well-
 * understood subset of the format. Hardlinks and symlinks are never
 * materialized — they are reported back as skipped so the scanner can surface
 * them instead of silently following them.
 */

import { mkdirSync, writeFileSync, chmodSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { gunzipSync } from 'node:zlib'

export interface SkippedEntry {
  path: string
  type: 'symlink' | 'hardlink'
  target: string
}

export interface ExtractResult {
  /** Package-relative paths of regular files written, posix-style. */
  files: string[]
  /** Links that were deliberately not materialized. */
  skipped: SkippedEntry[]
}

const BLOCK = 512

function str(buf: Buffer, off: number, len: number): string {
  return buf.subarray(off, off + len).toString('utf8').replace(/\0.*$/, '').trim()
}

/** Header numeric field: NUL-padded octal, or GNU base-256 for large sizes. */
function numeric(buf: Buffer, off: number, len: number): number {
  if (buf[off]! & 0x80) {
    let value = buf[off]! & 0x7f
    for (let i = off + 1; i < off + len; i += 1) {
      value = value * 256 + buf[i]!
    }
    return value
  }
  return parseInt(str(buf, off, len), 8) || 0
}

/** PAX extended header records: `<len> <key>=<value>\n`. */
function paxRecords(data: Buffer): Map<string, string> {
  const records = new Map<string, string>()
  let pos = 0
  while (pos < data.length) {
    const space = data.indexOf(' ', pos)
    if (space < 0) break
    const len = parseInt(data.subarray(pos, space).toString('utf8'), 10)
    if (!Number.isFinite(len) || len <= 0 || pos + len > data.length) break
    const record = data.subarray(space + 1, pos + len).toString('utf8')
    const eq = record.indexOf('=')
    if (eq > 0) records.set(record.slice(0, eq), record.slice(eq + 1).replace(/\n$/, ''))
    pos += len
  }
  return records
}

function stripPackagePrefix(name: string): string {
  let p = name
  if (p.startsWith('./')) p = p.slice(2)
  const slash = p.indexOf('/')
  // npm pack always roots the archive at `package/`; anything else is unusual
  // but legal, so only strip that exact well-known root.
  if (p.startsWith('package/')) p = p.slice('package/'.length)
  else if (slash === -1 && p === 'package') p = ''
  return p
}

/**
 * Extract a (possibly gzipped) tar buffer into `destDir`. Entry paths must
 * stay inside `destDir`; anything that escapes — `..`, absolute paths — is a
 * malformed or hostile archive and throws rather than being written.
 */
export function extractTarball(tarball: Buffer, destDir: string): ExtractResult {
  const buf = tarball[0] === 0x1f && tarball[1] === 0x8b ? gunzipSync(tarball) : tarball
  const root = resolve(destDir)
  const files: string[] = []
  const skipped: SkippedEntry[] = []
  let pendingPath: string | undefined
  let globalPax = new Map<string, string>()
  let pos = 0

  while (pos + BLOCK <= buf.length) {
    const header = buf.subarray(pos, pos + BLOCK)
    if (header.every((byte) => byte === 0)) break // end-of-archive block
    pos += BLOCK

    const size = numeric(header, 124, 12)
    const typeflag = String.fromCharCode(header[156]!)
    const data = buf.subarray(pos, pos + size)
    pos += size + ((BLOCK - (size % BLOCK)) % BLOCK)

    if (typeflag === 'x' || typeflag === 'X') {
      pendingPath = paxRecords(data).get('path')
      continue
    }
    if (typeflag === 'g') {
      globalPax = paxRecords(data)
      continue
    }
    if (typeflag === 'L') {
      pendingPath = data.toString('utf8').replace(/\0.*$/, '').trim()
      continue
    }

    let name = pendingPath ?? globalPax.get('path') ?? str(header, 345, 155) + str(header, 0, 100)
    pendingPath = undefined
    name = stripPackagePrefix(name)
    if (!name || name === '.' || name === './') continue

    if (typeflag === '1' || typeflag === '2') {
      skipped.push({
        path: name,
        type: typeflag === '1' ? 'hardlink' : 'symlink',
        target: str(header, 157, 100),
      })
      continue
    }
    if (typeflag === '5') {
      mkdirSync(join(root, name), { recursive: true })
      continue
    }
    if (typeflag !== '0' && typeflag !== '\0' && typeflag !== '7') continue // devices, fifos: ignore

    const parts = name.split('/')
    if (name.startsWith('/') || parts.includes('..')) {
      throw new Error(`tarball entry escapes destination: ${name}`)
    }
    const abs = resolve(root, name)
    if (abs !== root && !abs.startsWith(root + sep)) {
      throw new Error(`tarball entry escapes destination: ${name}`)
    }
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, data)
    const mode = numeric(header, 100, 8)
    if (mode & 0o111) chmodSync(abs, mode)
    files.push(name)
  }
  return { files: files.sort(), skipped }
}
