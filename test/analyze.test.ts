import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { analyze, reachableFrom } from '../src/analyze.ts'

function fixture(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-vet-analyze-'))
  for (const [path, content] of Object.entries(files)) {
    const abs = join(dir, path)
    mkdirSync(join(abs, '..'), { recursive: true })
    writeFileSync(abs, content)
  }
  return dir
}

describe('analyze', () => {
  it('parses ESM and CJS, collecting imports and externals', () => {
    const dir = fixture({
      'package.json': '{"name":"m","main":"index.js"}',
      'index.js': "import { helper } from './lib/helper.js'\nexport const x = helper()",
      'lib/helper.js': "const fs = require('fs')\nmodule.exports = { helper: () => fs.constants.F_OK }",
    })
    try {
      const a = analyze(dir)
      expect(a.files.map((f) => f.path)).toEqual(['index.js', 'lib/helper.js'])
      expect(a.files[0]!.sourceType).toBe('module')
      // `require` + `module.exports` is syntactically valid ESM too; only a
      // hard syntax difference (top-level return) forces the script fallback.
      expect(a.files[1]!.externals).toEqual(['fs'])
      expect(a.entries).toEqual(['index.js'])
      expect(a.reachable.has('lib/helper.js')).toBe(true)
      expect(a.unreachable).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('flags files not reachable from declared entries', () => {
    const dir = fixture({
      'package.json': '{"name":"m","main":"index.js"}',
      'index.js': "import './a.js'",
      'a.js': "export const a = 1",
      'orphan.js': "export const dead = 2",
    })
    try {
      const a = analyze(dir)
      expect(a.unreachable).toEqual(['orphan.js'])
      expect([...reachableFrom(a, 'index.js')]).toEqual(['a.js'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('records capability uses for fs writes, subprocess, and network clients', () => {
    const dir = fixture({
      'package.json': '{"name":"m"}',
      'index.js': [
        "import fs from 'node:fs'",
        "import cp from 'node:child_process'",
        "import http from 'node:http'",
        "fs.writeFileSync('/tmp/x', 'x')",
        "cp.exec('ls')",
        "http.request('https://api.example.com/ping')",
        "fetch('https://other.example.com')",
      ].join('\n'),
    })
    try {
      const a = analyze(dir)
      const caps = new Set(a.capUses.map((u) => u.cap))
      expect(caps.has('fs-write')).toBe(true)
      expect(caps.has('shell')).toBe(true)
      expect(caps.has('net')).toBe(true)
      const netApis = a.netUses.map((u) => u.api).sort()
      expect(netApis).toEqual(['fetch', 'http.request'])
      const literals = a.netUses.flatMap((u) => u.literals).sort()
      expect(literals).toEqual(['https://api.example.com/ping', 'https://other.example.com'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('records env reads and secret-adjacent file reads', () => {
    const dir = fixture({
      'package.json': '{"name":"m"}',
      'index.js': [
        "const fs = require('fs')",
        "const token = process.env['DSH_TOKEN']",
        "const key = fs.readFileSync('/home/u/.dsh/credentials.json')",
      ].join('\n'),
    })
    try {
      const a = analyze(dir)
      expect(a.capUses.some((u) => u.cap === 'env')).toBe(true)
      expect(a.capUses.some((u) => u.cap === 'secret-read')).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('collects eval, dynamic require, encoded literals, and charcode chains', () => {
    const dir = fixture({
      'package.json': '{"name":"m"}',
      'index.js': [
        "const mod = process.argv[2]",
        "eval(mod)",
        "require('dsh-' + mod)",
        "const blob = 'aGVsbG8gd29ybGQgZnJvbSBkZmQgdGVzdCBwYXlsb2FkAQID'",
        "const tag = String.fromCharCode(104, 105, 110, 116, 58, 32, 49, 50)",
      ].join('\n'),
    })
    try {
      const a = analyze(dir)
      expect(a.evalUses).toHaveLength(1)
      expect(a.evalUses[0]!.literal).toBe(false)
      expect(a.dynamicImports).toHaveLength(1)
      expect(a.dynamicImports[0]!.literals).toBeNull()
      expect(a.encodedLiterals.map((l) => l.charset)).toEqual(['base64'])
      expect(a.charcodeCalls).toHaveLength(1)
      expect(a.charcodeCalls[0]!.chars.startsWith('hint:')).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('falls back to script parsing for top-level return (CJS)', () => {
    const dir = fixture({
      'package.json': '{"name":"m","main":"c.js"}',
      'c.js': "const fs = require('fs')\nmodule.exports = fs.constants\nreturn",
    })
    try {
      const a = analyze(dir)
      expect(a.files[0]!.sourceType).toBe('script')
      expect(a.files[0]!.parseError).toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('records parse errors for files that are neither module nor script', () => {
    const dir = fixture({
      'package.json': '{"name":"m"}',
      'broken.js': 'function {{{ nope',
    })
    try {
      const a = analyze(dir)
      expect(a.files[0]!.parseError).toBeTruthy()
      expect(a.files[0]!.sourceType).toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('reads declared seams from package.json dsh.seams', () => {
    const dir = fixture({
      'package.json': '{"name":"m","dsh":{"seams":["fs","web"]}}',
      'index.js': 'export {}',
    })
    try {
      expect(analyze(dir).pkg?.seams).toEqual(['fs', 'web'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('resolves entries from exports maps and bin entries', () => {
    const dir = fixture({
      'package.json':
        '{"name":"m","exports":{".":{"import":"./dist/esm.js","require":"./dist/cjs.js"}},"bin":{"m":"./bin/m.js"}}',
      'dist/esm.js': 'export {}',
      'dist/cjs.js': 'module.exports = {}',
      'bin/m.js': '#!/usr/bin/env node\nconsole.log(1)',
    })
    try {
      const a = analyze(dir)
      expect(a.entries).toEqual(['bin/m.js', 'dist/cjs.js', 'dist/esm.js'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('analysis inputs and omissions', () => {
  it('captures package.json and analyzed JS as identity inputs with exact bytes', () => {
    const dir = fixture({
      'package.json': '{"name":"m","main":"index.js"}',
      'index.js': 'export const x = 1',
      'README.md': 'not analyzed',
    })
    try {
      const a = analyze(dir)
      expect(a.inputs.map((input) => input.path)).toEqual(['package.json', 'index.js'])
      expect(a.inputs[1]!.bytes.byteLength).toBe(Buffer.byteLength('export const x = 1'))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('works without a package.json at all', () => {
    const dir = fixture({ 'index.js': 'export const x = 1' })
    try {
      const a = analyze(dir)
      expect(a.pkg).toBeNull()
      expect(a.inputs.map((input) => input.path)).toEqual(['index.js'])
      // The implicit index.js entry resolves, so it is not "unresolved".
      expect(a.entries).toEqual(['index.js'])
      expect(a.unresolvedEntries).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('records symlinks as omissions and never reads through them', () => {
    const dir = fixture({ 'package.json': '{"name":"m","main":"index.js"}', 'index.js': 'export const x = 1' })
    try {
      symlinkSync('index.js', join(dir, 'link.js'))
      const a = analyze(dir)
      expect(a.files.map((f) => f.path)).toEqual(['index.js'])
      expect(a.omissions).toEqual([{ reason: 'symlink', path: 'link.js' }])
      expect(a.inputs.map((input) => input.path)).toEqual(['package.json', 'index.js'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('separates unresolved entries from non-JS resolvable hints', () => {
    const dir = fixture({
      'package.json': '{"name":"m","main":"index.js","exports":{"./package.json":"./package.json"}}',
      'index.js': 'export const x = 1',
    })
    try {
      const a = analyze(dir)
      expect(a.entries).toEqual(['index.js'])
      expect(a.unresolvedEntries).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('# subpath imports (package.json imports map)', () => {
  it('resolves # specifiers through the imports map, node condition over default', () => {
    // The importer sits in src/ while the mapped paths are package-root
    // relative — imports-map values resolve like `exports`, not like
    // relative specifiers.
    const dir = fixture({
      'package.json': JSON.stringify({
        name: 'm',
        main: 'src/index.js',
        imports: {
          '#internal': './lib/internal.js',
          '#conditional': { node: './lib/node.js', default: './lib/browser.js' },
        },
      }),
      'src/index.js': "import internal from '#internal'\nimport conditional from '#conditional'",
      'lib/internal.js': 'export const x = 1',
      'lib/node.js': 'export const y = 2',
      'lib/browser.js': 'export const z = 3',
    })
    try {
      const a = analyze(dir)
      expect(a.entries).toEqual(['src/index.js'])
      expect(a.reachable.has('lib/internal.js')).toBe(true)
      expect(a.reachable.has('lib/node.js')).toBe(true)
      // The browser condition is not node resolution: correctly unreachable.
      expect(a.reachable.has('lib/browser.js')).toBe(false)
      expect(a.unreachable).toEqual(['lib/browser.js'])
      // # specifiers are internal references, never external packages.
      expect(a.files[0]!.externals).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('resolves # specifiers in require and dynamic import too', () => {
    const dir = fixture({
      'package.json': '{"name":"m","main":"index.js","imports":{"#helpers":"./helpers.js"}}',
      'index.js': "const h = require('#helpers')\nconst lazy = () => import('#helpers')",
      'helpers.js': 'module.exports = {}',
    })
    try {
      const a = analyze(dir)
      expect(a.reachable.has('helpers.js')).toBe(true)
      expect(a.unreachable).toEqual([])
      expect(a.files[0]!.externals).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('degrades to unreachable when the map is missing or too nested — no guessed match', () => {
    const dir = fixture({
      'package.json':
        '{"name":"m","main":"index.js","imports":{"#deep":{"node":{"import":"./a.js"}}}}',
      'index.js': "import a from '#deep'\nimport b from '#missing'",
      'a.js': 'export const a = 1',
    })
    try {
      const a = analyze(dir)
      expect(a.unreachable).toEqual(['a.js'])
      expect(a.files[0]!.externals).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
