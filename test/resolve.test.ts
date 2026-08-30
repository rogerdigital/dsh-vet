import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fakeFetchBody, fakeResponse, gzippedTar } from './helpers.ts'
import {
  VetError,
  classifySpecifier,
  parseNpmSpecifier,
  resolveTarget,
} from '../src/resolve.ts'

describe('classifySpecifier', () => {
  const nope = () => false

  it('recognizes relative, absolute, and ~ paths as local', () => {
    expect(classifySpecifier('./pkg', nope)).toBe('local-path')
    expect(classifySpecifier('../pkg', nope)).toBe('local-path')
    expect(classifySpecifier('/tmp/pkg', nope)).toBe('local-path')
    expect(classifySpecifier('~/code/pkg', nope)).toBe('local-path')
  })

  it('recognizes git URLs and shorthands', () => {
    expect(classifySpecifier('https://github.com/u/r.git', nope)).toBe('git-repo')
    expect(classifySpecifier('git@github.com:u/r.git', nope)).toBe('git-repo')
    expect(classifySpecifier('git+https://github.com/u/r.git', nope)).toBe('git-repo')
    expect(classifySpecifier('github:u/r', nope)).toBe('git-repo')
  })

  it('treats existing plain names as local paths and the rest as npm packages', () => {
    expect(classifySpecifier('src', (p) => p === 'src')).toBe('local-path')
    expect(classifySpecifier('dsh-vault', nope)).toBe('npm-package')
    expect(classifySpecifier('@dsh/vault', nope)).toBe('npm-package')
    expect(classifySpecifier('@dsh/vault@1.0.0', nope)).toBe('npm-package')
  })

  it('rejects garbage', () => {
    expect(() => classifySpecifier('not a specifier!', nope)).toThrow(VetError)
  })
})

describe('parseNpmSpecifier', () => {
  it('splits name and spec, scoped and plain', () => {
    expect(parseNpmSpecifier('dsh-vault')).toEqual({ name: 'dsh-vault' })
    expect(parseNpmSpecifier('dsh-vault@1.10.6')).toEqual({ name: 'dsh-vault', spec: '1.10.6' })
    expect(parseNpmSpecifier('@dsh/vault')).toEqual({ name: '@dsh/vault' })
    expect(parseNpmSpecifier('@dsh/vault@next')).toEqual({ name: '@dsh/vault', spec: 'next' })
  })
})

describe('resolveTarget', () => {
  it('resolves a local directory with zero network', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-vet-local-'))
    try {
      writeFileSync(join(dir, 'package.json'), '{"name":"local-demo"}')
      const resolved = await resolveTarget(dir)
      expect(resolved.target.kind).toBe('local-path')
      expect(resolved.rootDir).toBe(dir)
      expect(readFileSync(join(resolved.rootDir, 'package.json'), 'utf8')).toContain('local-demo')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('rejects a local path that is not a directory', async () => {
    await expect(resolveTarget('/definitely/not/a/dir')).rejects.toThrow(VetError)
  })

  it('resolves an npm package from registry metadata and verifies integrity', async () => {
    const tarball = gzippedTar([
      { name: 'package/package.json', data: '{"name":"dsh-vault","version":"1.10.6"}' },
      { name: 'package/index.js', data: 'export const x = 1' },
    ])
    const integrity = `sha512-${createHash('sha512').update(tarball).digest('base64')}`
    const packument = {
      'dist-tags': { latest: '1.10.6' },
      versions: {
        '1.10.6': { version: '1.10.6', dist: { tarball: 'https://registry.example/dsh-vault-1.10.6.tgz', integrity } },
      },
    }
    const seen: string[] = []
    const fetchImpl = async (url: string) => {
      seen.push(url)
      return url.endsWith('.tgz') ? fakeFetchBody(tarball) : fakeResponse(packument)
    }
    const resolved = await resolveTarget('dsh-vault@1.10.6', { fetchImpl, registry: 'https://registry.example' })
    try {
      expect(seen).toEqual(['https://registry.example/dsh-vault', 'https://registry.example/dsh-vault-1.10.6.tgz'])
      expect(resolved.target).toEqual({
        kind: 'npm-package',
        specifier: 'dsh-vault@1.10.6',
        resolved: { version: '1.10.6', integrity },
      })
      expect(resolved.files).toEqual(['index.js', 'package.json'])
      expect(readFileSync(join(resolved.rootDir, 'index.js'), 'utf8')).toBe('export const x = 1')
    } finally {
      resolved.cleanup()
    }
  })

  it('encodes scoped package names for the registry', async () => {
    const tarball = gzippedTar([{ name: 'package/index.js', data: '0' }])
    const integrity = `sha512-${createHash('sha512').update(tarball).digest('base64')}`
    const packument = {
      'dist-tags': { latest: '2.0.0' },
      versions: { '2.0.0': { version: '2.0.0', dist: { tarball: 'https://r.example/t.tgz', integrity } } },
    }
    const seen: string[] = []
    const fetchImpl = async (url: string) => {
      seen.push(url)
      return url.endsWith('.tgz') ? fakeFetchBody(tarball) : fakeResponse(packument)
    }
    const resolved = await resolveTarget('@dsh/vault', { fetchImpl, registry: 'https://r.example' })
    resolved.cleanup()
    expect(seen[0]).toBe('https://r.example/@dsh%2Fvault')
  })

  it('fails hard on an integrity mismatch', async () => {
    const tarball = gzippedTar([{ name: 'package/index.js', data: 'tampered' }])
    const wrong = `sha512-${createHash('sha512').update(Buffer.from('other')).digest('base64')}`
    const packument = {
      'dist-tags': { latest: '1.0.0' },
      versions: { '1.0.0': { version: '1.0.0', dist: { tarball: 'https://r.example/t.tgz', integrity: wrong } } },
    }
    const fetchImpl = async (url: string) =>
      url.endsWith('.tgz') ? fakeFetchBody(tarball) : fakeResponse(packument)
    await expect(resolveTarget('dsh-vault', { fetchImpl })).rejects.toThrow(/integrity mismatch/)
  })

  it('fails on a version that does not exist', async () => {
    const fetchImpl = async () => fakeResponse({ 'dist-tags': {}, versions: {} })
    await expect(resolveTarget('dsh-vault@9.9.9', { fetchImpl })).rejects.toThrow(/no matching version/)
  })

  it('keeps the workspace clean when extraction throws', async () => {
    const evil = gzippedTar([{ name: 'package/../../escape.js', data: 'x' }])
    const integrity = `sha512-${createHash('sha512').update(evil).digest('base64')}`
    const packument = {
      'dist-tags': { latest: '1.0.0' },
      versions: { '1.0.0': { version: '1.0.0', dist: { tarball: 'https://r.example/e.tgz', integrity } } },
    }
    const fetchImpl = async (url: string) =>
      url.endsWith('.tgz') ? fakeFetchBody(evil) : fakeResponse(packument)
    await expect(resolveTarget('dsh-vault', { fetchImpl })).rejects.toThrow(/escapes destination/)
  })
})
