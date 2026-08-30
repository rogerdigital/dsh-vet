import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { buildTar } from './helpers.ts'
import { extractTarball } from '../src/tar.ts'

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'dsh-vet-tar-test-'))
}

describe('extractTarball', () => {
  it('extracts files and nested directories from an npm-style tarball', () => {
    const dir = tempDir()
    try {
      const tar = buildTar([
        { name: 'package/', type: '5' },
        { name: 'package/package.json', data: '{"name":"x"}' },
        { name: 'package/lib/deep/mod.js', data: 'export {}' },
      ])
      const result = extractTarball(tar, dir)
      expect(result.files).toEqual(['lib/deep/mod.js', 'package.json'])
      expect(readFileSync(join(dir, 'package.json'), 'utf8')).toBe('{"name":"x"}')
      expect(readFileSync(join(dir, 'lib/deep/mod.js'), 'utf8')).toBe('export {}')
      expect(result.skipped).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('decompresses gzipped tarballs', () => {
    const dir = tempDir()
    try {
      const tar = gzipSync(buildTar([{ name: 'package/index.js', data: '1' }]))
      const result = extractTarball(tar, dir)
      expect(result.files).toEqual(['index.js'])
      expect(readFileSync(join(dir, 'index.js'), 'utf8')).toBe('1')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('applies PAX path overrides', () => {
    const dir = tempDir()
    try {
      const record = ' path=package/overridden.js\n'
      const total = record.length + String(record.length + 2).length
      const pax = Buffer.from(`${total}${record}`)
      const tar = buildTar([
        { name: 'package/PaxHeaders/x', data: pax, type: 'x' },
        { name: 'package/original.js', data: 'x' },
      ])
      const result = extractTarball(tar, dir)
      expect(result.files).toEqual(['overridden.js'])
      expect(existsSync(join(dir, 'overridden.js'))).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('skips symlinks and hardlinks instead of materializing them', () => {
    const dir = tempDir()
    try {
      const tar = buildTar([
        { name: 'package/real.js', data: 'real' },
        { name: 'package/link.js', type: '2', linkname: 'real.js' },
        { name: 'package/hard.js', type: '1', linkname: 'package/real.js' },
      ])
      const result = extractTarball(tar, dir)
      expect(result.files).toEqual(['real.js'])
      expect(result.skipped).toEqual([
        { path: 'link.js', type: 'symlink', target: 'real.js' },
        { path: 'hard.js', type: 'hardlink', target: 'package/real.js' },
      ])
      expect(existsSync(join(dir, 'link.js'))).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('preserves the exec bit for executable entries', () => {
    const dir = tempDir()
    try {
      const tar = buildTar([{ name: 'package/bin/cli.js', data: '#!/usr/bin/env node', mode: 0o755 }])
      extractTarball(tar, dir)
      expect(readFileSync(join(dir, 'bin/cli.js'), 'utf8')).toBe('#!/usr/bin/env node')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('throws on entries that escape the destination', () => {
    const dir = tempDir()
    try {
      const evil = buildTar([{ name: 'package/../../outside.js', data: 'nope' }])
      expect(() => extractTarball(evil, dir)).toThrow(/escapes destination/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('handles a tarball without the package/ root', () => {
    const dir = tempDir()
    try {
      const tar = buildTar([{ name: './index.js', data: 'flat' }])
      const result = extractTarball(tar, dir)
      expect(result.files).toEqual(['index.js'])
      expect(readFileSync(join(dir, 'index.js'), 'utf8')).toBe('flat')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
