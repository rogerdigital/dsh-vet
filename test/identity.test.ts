import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { analysisInputDigest } from '../src/identity.ts'
import { analyze } from '../src/analyze.ts'

function tempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

function write(dir: string, files: Record<string, string>): void {
  for (const [path, content] of Object.entries(files)) {
    const abs = join(dir, path)
    mkdirSync(join(abs, '..'), { recursive: true })
    writeFileSync(abs, content)
  }
}

describe('analysisInputDigest', () => {
  it('is identical for identical content under different roots', () => {
    const first = tempDir('dsh-vet-id1-')
    const second = tempDir('dsh-vet-id2-')
    try {
      const files = {
        'package.json': '{"name":"m","main":"index.js"}',
        'index.js': 'export const x = 1',
        'lib/helper.js': 'module.exports = { helper: () => 1 }',
      }
      write(first, files)
      write(second, files)
      expect(analysisInputDigest(analyze(first).inputs)).toBe(analysisInputDigest(analyze(second).inputs))
    } finally {
      rmSync(first, { recursive: true, force: true })
      rmSync(second, { recursive: true, force: true })
    }
  })

  it('changes when one analyzed byte changes', () => {
    const first = tempDir('dsh-vet-id3-')
    const second = tempDir('dsh-vet-id4-')
    try {
      write(first, { 'package.json': '{"name":"m"}', 'index.js': 'export const x = 1' })
      write(second, { 'package.json': '{"name":"m"}', 'index.js': 'export const x = 2' })
      expect(analysisInputDigest(analyze(first).inputs)).not.toBe(analysisInputDigest(analyze(second).inputs))
    } finally {
      rmSync(first, { recursive: true, force: true })
      rmSync(second, { recursive: true, force: true })
    }
  })

  it('changes when package metadata changes', () => {
    const first = tempDir('dsh-vet-id5-')
    const second = tempDir('dsh-vet-id6-')
    try {
      write(first, { 'package.json': '{"name":"m","version":"1.0.0"}', 'index.js': 'export const x = 1' })
      write(second, { 'package.json': '{"name":"m","version":"1.0.1"}', 'index.js': 'export const x = 1' })
      expect(analysisInputDigest(analyze(first).inputs)).not.toBe(analysisInputDigest(analyze(second).inputs))
    } finally {
      rmSync(first, { recursive: true, force: true })
      rmSync(second, { recursive: true, force: true })
    }
  })

  it('stays equal when only a non-analyzed file changes', () => {
    const first = tempDir('dsh-vet-id7-')
    const second = tempDir('dsh-vet-id8-')
    try {
      write(first, { 'package.json': '{"name":"m"}', 'index.js': 'export const x = 1', 'README.md': 'one' })
      write(second, { 'package.json': '{"name":"m"}', 'index.js': 'export const x = 1', 'README.md': 'two' })
      expect(analysisInputDigest(analyze(first).inputs)).toBe(analysisInputDigest(analyze(second).inputs))
    } finally {
      rmSync(first, { recursive: true, force: true })
      rmSync(second, { recursive: true, force: true })
    }
  })

  it('covers the exact bytes analysis read, in a stable manifest form', () => {
    const dir = tempDir('dsh-vet-id9-')
    try {
      write(dir, { 'package.json': '{"name":"m"}', 'index.js': 'export const x = 1' })
      const { inputs } = analyze(dir)
      expect(inputs.map((input) => input.path)).toEqual(['package.json', 'index.js'])
      // The digest is a plain function of the snapshots: same snapshots,
      // same digest, regardless of array order.
      const reordered = [inputs[1]!, inputs[0]!]
      expect(analysisInputDigest(reordered)).toBe(analysisInputDigest(inputs))
      expect(analysisInputDigest(inputs)).toMatch(/^sha256:[0-9a-f]{64}$/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
