/**
 * Target resolution (ROADMAP T1): turn a CLI specifier into a local directory
 * ready for analysis, plus the `VetTarget` metadata the report carries.
 *
 * - npm packages are fetched through registry metadata only (packument →
 *   dist.tarball), and the downloaded tarball must match `dist.integrity`
 *   before anything is extracted.
 * - local paths never touch the network.
 * - git repos are cloned with `git clone --depth 1`; cloning runs no package
 *   code (no lifecycle scripts), unlike an install.
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { extractTarball } from './tar.ts'
import type { VetTarget } from './contract.ts'

export type SpecifierKind = VetTarget['kind']

export interface ResolveOptions {
  /** Injectable fetch for tests; defaults to the global fetch. */
  fetchImpl?: (url: string) => Promise<Response>
  /** Registry base, default `https://registry.npmjs.org`. */
  registry?: string
}

export interface ResolvedTarget {
  target: VetTarget
  /** Local directory holding the artifact to scan. */
  rootDir: string
  /** Package-relative paths of files the tarball contained, when known. */
  files?: string[]
  /** Links found in the tarball that were deliberately not materialized. */
  skippedLinks?: Array<{ path: string; type: string; target: string }>
  cleanup: () => void
}

export class VetError extends Error {}

const GIT_RE = /^(?:git\+)?(?:ssh:\/\/|https?:\/\/|git@)[^\s]+$|^(?:github|gitlab|bitbucket):[^\s]+$/

/** Classify a specifier without any network access. */
export function classifySpecifier(specifier: string, exists = existsSync): SpecifierKind {
  const s = specifier.trim()
  if (s.startsWith('./') || s.startsWith('../') || s.startsWith('/') || s.startsWith('~')) {
    return 'local-path'
  }
  if (GIT_RE.test(s)) return 'git-repo'
  if (exists(s)) return 'local-path' // a plain name that exists on disk wins: `dsh vet .`
  if (/^@[^/\s]+\/[^@\s]+(?:@[^@\s]+)?$/.test(s) || /^[^@\s][^/\s]*$/.test(s)) return 'npm-package'
  throw new VetError(`cannot classify specifier: ${specifier}`)
}

/** Split `name`, `name@version`, `@scope/name`, `@scope/name@tag|version`. */
export function parseNpmSpecifier(specifier: string): { name: string; spec?: string } {
  const scoped = specifier.startsWith('@')
  const base = scoped ? specifier.slice(1) : specifier
  const at = base.lastIndexOf('@')
  if (at < 0) return { name: specifier }
  const name = (scoped ? '@' : '') + base.slice(0, at)
  const spec = base.slice(at + 1)
  if (!name || !spec) return { name: specifier }
  return { name, spec }
}

function registryPath(name: string): string {
  // The registry addresses scoped packages with an encoded slash.
  return name.startsWith('@') ? name.replace('/', '%2F') : name
}

async function fetchJson(url: string, opts: ResolveOptions): Promise<any> {
  const doFetch = opts.fetchImpl ?? ((u: string) => fetch(u))
  const res = await doFetch(url)
  if (!res.ok) throw new VetError(`registry request failed (${res.status}) for ${url}`)
  return res.json()
}

async function fetchBuffer(url: string, opts: ResolveOptions): Promise<Buffer> {
  const doFetch = opts.fetchImpl ?? ((u: string) => fetch(u))
  const res = await doFetch(url)
  if (!res.ok) throw new VetError(`tarball request failed (${res.status}) for ${url}`)
  return Buffer.from(await res.arrayBuffer())
}

function verifyIntegrity(tarball: Buffer, integrity: string | undefined, shasum: string | undefined): void {
  if (integrity) {
    const match = /^sha(512|384|256|1)-([A-Za-z0-9+/=]+)$/.exec(integrity)
    if (!match) throw new VetError(`unsupported integrity format: ${integrity}`)
    const [, bits, expected] = match
    const actual = createHash(`sha${bits}`).update(tarball).digest('base64')
    if (actual !== expected) {
      throw new VetError(`integrity mismatch for downloaded tarball (expected ${integrity}, got sha${bits}-${actual})`)
    }
    return
  }
  if (shasum) {
    const actual = createHash('sha1').update(tarball).digest('hex')
    if (actual !== shasum) throw new VetError(`shasum mismatch for downloaded tarball`)
  }
}

function tmpWorkspace(): string {
  return mkdtempSync(join(tmpdir(), 'dsh-vet-'))
}

function cleanupDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true })
}

async function resolveNpm(specifier: string, opts: ResolveOptions): Promise<ResolvedTarget> {
  const registry = (opts.registry ?? 'https://registry.npmjs.org').replace(/\/$/, '')
  const { name, spec } = parseNpmSpecifier(specifier)
  const packument = await fetchJson(`${registry}/${registryPath(name)}`, opts)
  const versions: Record<string, any> = packument?.versions ?? {}
  const distTags: Record<string, string> = packument?.['dist-tags'] ?? {}
  const version = spec
    ? (versions[spec]?.version ?? distTags[spec])
    : (distTags['latest'] ?? Object.keys(versions).at(-1))
  if (!version || !versions[version]) {
    throw new VetError(`no matching version for ${specifier} (resolved candidate: ${version ?? 'none'})`)
  }
  const dist = versions[version]?.dist ?? {}
  if (!dist.tarball) throw new VetError(`registry metadata for ${name}@${version} has no tarball URL`)

  const tarball = await fetchBuffer(dist.tarball, opts)
  verifyIntegrity(tarball, dist.integrity, dist.shasum)
  const work = tmpWorkspace()
  try {
    const extracted = extractTarball(tarball, work)
    return {
      target: {
        kind: 'npm-package',
        specifier,
        resolved: { version, integrity: dist.integrity },
      },
      rootDir: work,
      files: extracted.files,
      skippedLinks: extracted.skipped,
      cleanup: () => cleanupDir(work),
    }
  } catch (err) {
    cleanupDir(work)
    throw err
  }
}

function runGit(args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('git', args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => (stdout += chunk))
    child.stderr.on('data', (chunk) => (stderr += chunk))
    child.on('error', (err) => reject(new VetError(`git is not available: ${err.message}`)))
    child.on('close', (code) =>
      code === 0
        ? resolvePromise({ stdout, stderr })
        : reject(new VetError(`git ${args[0]} failed (${code}): ${stderr.trim()}`)),
    )
  })
}

async function resolveGit(specifier: string): Promise<ResolvedTarget> {
  const url = specifier.replace(/^git\+/, '')
  const work = tmpWorkspace()
  try {
    await runGit(['clone', '--depth', '1', '--quiet', url, work])
    const { stdout } = await runGit(['-C', work, 'rev-parse', 'HEAD'])
    return {
      target: { kind: 'git-repo', specifier: url, resolved: { commit: stdout.trim() } },
      rootDir: work,
      cleanup: () => cleanupDir(work),
    }
  } catch (err) {
    cleanupDir(work)
    throw err
  }
}

function resolveLocal(specifier: string): ResolvedTarget {
  const dir = specifier.startsWith('~/')
    ? resolve(homedir(), specifier.slice(2))
    : resolve(specifier)
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    throw new VetError(`local path is not a directory: ${specifier}`)
  }
  return {
    target: { kind: 'local-path', specifier: dir },
    rootDir: dir,
    cleanup: () => {},
  }
}

/** Resolve any accepted specifier into a scannable local directory. */
export async function resolveTarget(specifier: string, opts: ResolveOptions = {}): Promise<ResolvedTarget> {
  switch (classifySpecifier(specifier)) {
    case 'npm-package':
      return resolveNpm(specifier, opts)
    case 'git-repo':
      return resolveGit(specifier)
    case 'local-path':
      return resolveLocal(specifier)
  }
}
