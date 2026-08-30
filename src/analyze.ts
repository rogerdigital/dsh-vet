/**
 * Analysis engine (ROADMAP T2): parse shipped JS with acorn, build the static
 * module graph, and classify the capability surface each file touches.
 *
 * Everything here is best-effort static analysis (ROADMAP D2): call arguments
 * that depend on runtime values are recorded without interpretation, and the
 * rules decide how much confidence that earns.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { parse } from 'acorn'
import type { Node } from 'acorn'

export type Capability =
  | 'fs'
  | 'fs-write'
  | 'shell'
  | 'net'
  | 'workers'
  | 'crypto'
  | 'env'
  | 'homedir'
  | 'secret-read'

export interface CapabilityUse {
  cap: Capability
  file: string
  line: number
  api: string
  snippet: string
  /** Literal argument strings at the call site, when statically known. */
  literals: string[]
}

export interface NetUse {
  file: string
  line: number
  api: string
  literals: string[]
  snippet: string
}

export interface EvalUse {
  file: string
  line: number
  kind: 'eval' | 'Function'
  literal: boolean
  snippet: string
}

export interface DynamicImportUse {
  file: string
  line: number
  kind: 'require' | 'import'
  /** Statically concatenated argument value, when recoverable. */
  literals: string[] | null
  snippet: string
}

export interface EncodedLiteral {
  file: string
  line: number
  value: string
  charset: 'base64' | 'hex'
}

export interface CharcodeCall {
  file: string
  line: number
  chars: string
}

export interface ImportRef {
  specifier: string
  line: number
}

export interface SourceFile {
  path: string
  code: string
  sourceType: 'module' | 'script' | null
  parseError: string | null
  ast: Node | null
  imports: ImportRef[]
  /** Bare (non-relative) module specifiers imported by this file. */
  externals: string[]
}

export interface PkgJson {
  raw: Record<string, unknown>
  name: string
  version: string
  scripts: Record<string, string>
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
  /** Declared Cordis seams, read from `dsh.seams` in package.json. */
  seams: string[] | null
  entryHints: string[]
}

export interface Analysis {
  rootDir: string
  pkg: PkgJson | null
  files: SourceFile[]
  fileByPath: Map<string, SourceFile>
  entries: string[]
  reachable: Set<string>
  unreachable: string[]
  /** Static relative import edges: file → files it imports. */
  edges: Map<string, string[]>
  capUses: CapabilityUse[]
  netUses: NetUse[]
  evalUses: EvalUse[]
  dynamicImports: DynamicImportUse[]
  encodedLiterals: EncodedLiteral[]
  charcodeCalls: CharcodeCall[]
}

// ---------------------------------------------------------------------------
// Capability tables

const BUILTIN_BASE: Record<string, Capability[]> = {
  fs: ['fs'],
  'node:fs': ['fs'],
  'fs/promises': ['fs'],
  'node:fs/promises': ['fs'],
  'node:child_process': ['shell'],
  child_process: ['shell'],
  net: ['net'],
  'node:net': ['net'],
  http: ['net'],
  'node:http': ['net'],
  https: ['net'],
  'node:https': ['net'],
  http2: ['net'],
  'node:http2': ['net'],
  tls: ['net'],
  'node:tls': ['net'],
  dgram: ['net'],
  'node:dgram': ['net'],
  dns: ['net'],
  'node:dns': ['net'],
  'node:worker_threads': ['workers'],
  worker_threads: ['workers'],
    'node:crypto': ['crypto'],
    crypto: ['crypto'],
}

const FS_WRITE_METHODS = new Set([
  'writeFile', 'appendFile', 'rm', 'unlink', 'rmdir', 'truncate', 'rename', 'cp',
  'createWriteStream', 'chmod', 'chown', 'writev',
])
for (const m of [...FS_WRITE_METHODS]) FS_WRITE_METHODS.add(`${m}Sync`)

const FS_READ_METHODS = new Set([
  'readFile', 'readdir', 'createReadStream', 'stat', 'lstat', 'exists', 'open', 'access',
])
for (const m of [...FS_READ_METHODS]) FS_READ_METHODS.add(`${m}Sync`)

const SHELL_METHODS = new Set([
  'spawn', 'exec', 'execFile', 'fork', 'spawnSync', 'execSync', 'execFileSync',
])

const NET_METHODS = new Set([
  'request', 'get', 'connect', 'createConnection', 'createSocket', 'lookup', 'resolve',
])

const HOMEDIR_METHODS = new Set(['homedir', 'userInfo'])

const CREDENTIAL_PATH_RE =
  /(?:^|[/\\])(?:\.env[^/\\]*|\.dsh|credentials|auth\.json|token|secret|\.npmrc|\.netrc|\.aws|\.ssh|\.gitconfig)(?:$|[/\\])/i

// ---------------------------------------------------------------------------

function toPosix(p: string): string {
  return p.split('\\').join('/')
}

function snippetAt(code: string, line: number): string {
  const text = code.split('\n')[line - 1] ?? ''
  return text.trim().slice(0, 120)
}

function listJsFiles(rootDir: string): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name.startsWith('.DS')) continue
      const abs = join(dir, entry.name)
      if (entry.isDirectory()) walk(abs)
      else if (/\.(?:js|mjs|cjs)$/.test(entry.name)) out.push(abs)
      else if (!entry.name.includes('.')) {
        // Extensionless bin scripts: only Node shebangs are plausibly JS.
        const head = readFileSync(abs, 'utf8').slice(0, 64)
        if (/^#![^\n]*\bnode\b/.test(head)) out.push(abs)
      }
    }
  }
  walk(rootDir)
  return out.sort()
}

function parseSource(path: string, code: string): Pick<SourceFile, 'ast' | 'sourceType' | 'parseError'> {
  const options = { ecmaVersion: 'latest', locations: true } as const
  try {
    return { ast: parse(code, { ...options, sourceType: 'module' }), sourceType: 'module', parseError: null }
  } catch (moduleError) {
    try {
      return {
        ast: parse(code, { ...options, sourceType: 'script', allowReturnOutsideFunction: true }),
        sourceType: 'script',
        parseError: null,
      }
    } catch {
      return { ast: null, sourceType: null, parseError: (moduleError as Error).message }
    }
  }
}

type Binding = { module: string } | { module: string; imported: string }

function argLiterals(args: Node[]): string[] {
  const out: string[] = []
  for (const arg of args) {
    if (arg.type === 'Literal' && typeof (arg as any).value === 'string') out.push((arg as any).value)
    if (arg.type === 'TemplateLiteral' && (arg as any).expressions.length === 0) {
      out.push((arg as any).quasis[0]?.value.raw ?? '')
    }
  }
  return out
}

/** Best-effort static string evaluation for require()/import() arguments. */
function staticString(node: Node | null | undefined): string | null {
  if (!node) return null
  if (node.type === 'Literal' && typeof (node as any).value === 'string') return (node as any).value
  if (node.type === 'TemplateLiteral' && (node as any).expressions.length === 0) {
    return (node as any).quasis[0]?.value.raw ?? ''
  }
  if (node.type === 'BinaryExpression' && (node as any).operator === '+') {
    const left = staticString((node as any).left)
    const right = staticString((node as any).right)
    return left !== null && right !== null ? left + right : null
  }
  return null
}

function isProcessEnv(node: Node): boolean {
  return (
    node.type === 'MemberExpression' &&
    !(node as any).computed &&
    (node as any).object.type === 'Identifier' &&
    (node as any).object.name === 'process' &&
    (node as any).property.type === 'Identifier' &&
    (node as any).property.name === 'env'
  )
}

function classifyMethodUse(file: SourceFile, module: string, method: string): { caps: Capability[]; api: string } {
  const api = `${module}.${method}`
  if (module === 'fs' || module === 'node:fs' || module === 'fs/promises' || module === 'node:fs/promises') {
    if (FS_WRITE_METHODS.has(method)) return { caps: ['fs', 'fs-write'], api }
    if (FS_READ_METHODS.has(method)) return { caps: ['fs'], api }
    return { caps: [], api }
  }
  if (module === 'child_process' || module === 'node:child_process') {
    if (SHELL_METHODS.has(method)) return { caps: ['shell'], api }
    return { caps: [], api }
  }
  if (module === 'os' || module === 'node:os') {
    if (HOMEDIR_METHODS.has(method)) return { caps: ['homedir'], api }
    return { caps: [], api }
  }
  if (BUILTIN_BASE[module]?.includes('net')) {
    if (NET_METHODS.has(method)) return { caps: ['net'], api }
    return { caps: [], api }
  }
  return { caps: [], api }
}

/**
 * Walk one parsed file, collecting imports, capability uses, and obfuscation
 * signals into the shared analysis arrays.
 */
function inspectFile(analysis: Analysis, file: SourceFile, ast: Node): void {
  const bindings = new Map<string, Binding>()
  const seenLines = new Set<string>()

  const pushCap = (cap: Capability, line: number, api: string, literals: string[], snippet: string) => {
    const key = `${file.path}:${line}:${api}:${cap}`
    if (seenLines.has(key)) return
    seenLines.add(key)
    analysis.capUses.push({ cap, file: file.path, line, api, literals, snippet })
  }

  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object') return
    const n = node as Record<string, unknown>
    const here = node as Node
    const line = (here as any).loc?.start.line ?? 0

    switch (here.type) {
      case 'ImportDeclaration':
      case 'ExportNamedDeclaration':
      case 'ExportAllDeclaration': {
        const source = (n as any).source
        if (source?.value) {
          file.imports.push({ specifier: source.value, line })
          if (!source.value.startsWith('.')) file.externals.push(source.value)
          const spec = source.value.replace(/^node:/, '')
          if (here.type === 'ImportDeclaration') {
            for (const spec2 of (n as any).specifiers ?? []) {
              if (spec2.type === 'ImportDefaultSpecifier' || spec2.type === 'ImportNamespaceSpecifier') {
                bindings.set(spec2.local.name, { module: spec })
              } else if (spec2.type === 'ImportSpecifier') {
                bindings.set(spec2.local.name, { module: spec, imported: spec2.imported.name })
              }
            }
          }
        }
        break
      }
      case 'VariableDeclarator': {
        const init = (n as any).init
        if (
          (n as any).id?.type === 'Identifier' &&
          init?.type === 'CallExpression' &&
          (init as any).callee.type === 'Identifier' &&
          (init as any).callee.name === 'require'
        ) {
          const arg = staticString((init as any).arguments[0])
          if (arg !== null) {
            file.imports.push({ specifier: arg, line })
            if (!arg.startsWith('.')) file.externals.push(arg)
            bindings.set((n as any).id.name, { module: arg.replace(/^node:/, '') })
          }
        }
        // const { writeFile } = require('fs')
        if ((n as any).id?.type === 'ObjectPattern' && init?.type === 'CallExpression') {
          const arg = staticString((init as any).arguments[0])
          if (
            arg !== null &&
            (init as any).callee.type === 'Identifier' &&
            (init as any).callee.name === 'require'
          ) {
            for (const prop of (n as any).id.properties ?? []) {
              if (prop.type === 'Property' && prop.value.type === 'Identifier' && prop.key.type === 'Identifier') {
                bindings.set(prop.value.name, { module: arg.replace(/^node:/, ''), imported: prop.key.name })
              }
            }
          }
        }
        break
      }
      case 'MemberExpression': {
        if (isProcessEnv(here) || isProcessEnv((n as any).object)) {
          pushCap('env', line, 'process.env', [], snippetAt(file.code, line))
        }
        break
      }
      case 'CallExpression':
      case 'NewExpression': {
        const callee = (n as any).callee
        const args: Node[] = (n as any).arguments ?? []
        const literals = argLiterals(args)
        const snippet = snippetAt(file.code, line)
        const isNew = here.type === 'NewExpression'

        if (callee.type === 'Identifier') {
          const name = callee.name
          const binding = bindings.get(name)
          if (name === 'eval') {
            analysis.evalUses.push({
              file: file.path,
              line,
              kind: 'eval',
              literal: literals.length > 0,
              snippet,
            })
          } else if (name === 'Function' && isNew) {
            analysis.evalUses.push({
              file: file.path,
              line,
              kind: 'Function',
              literal: literals.length > 0,
              snippet,
            })
          } else if (name === 'fetch' || name === 'WebSocket') {
            analysis.netUses.push({ file: file.path, line, api: name, literals, snippet })
            pushCap('net', line, name, literals, snippet)
          } else if (name === 'require' && !isNew) {
            const arg = args[0]
            const value = staticString(arg)
            if (arg?.type === 'Literal' && value !== null) {
              file.imports.push({ specifier: value, line })
              if (!value.startsWith('.')) file.externals.push(value)
            } else if (value !== null) {
              // Concatenated but statically recoverable: a real import edge
              // and an obfuscation signal at the same time.
              file.imports.push({ specifier: value, line })
              if (!value.startsWith('.')) file.externals.push(value)
              analysis.dynamicImports.push({
                file: file.path,
                line,
                kind: 'require',
                literals: [value],
                snippet,
              })
            } else {
              analysis.dynamicImports.push({
                file: file.path,
                line,
                kind: 'require',
                literals: null,
                snippet,
              })
            }
          } else if (name === 'Worker' && binding?.module === 'worker_threads') {
            pushCap('workers', line, 'worker_threads.Worker', literals, snippet)
          } else if (binding) {
            if ('imported' in binding) {
              const { caps, api } = classifyMethodUse(file, binding.module, binding.imported)
              for (const cap of caps) pushCap(cap, line, api, literals, snippet)
              if (BUILTIN_BASE[binding.module]?.includes('net') && NET_METHODS.has(binding.imported)) {
                analysis.netUses.push({ file: file.path, line, api, literals, snippet })
              }
            } else if (BUILTIN_BASE[binding.module]) {
              for (const cap of BUILTIN_BASE[binding.module]!) pushCap(cap, line, binding.module, literals, snippet)
            }
          }
        } else if (callee.type === 'MemberExpression') {
          const object = callee.object
          const property = callee.property
          const propName = property.type === 'Identifier' && !callee.computed ? property.name : null

          if (object.type === 'Identifier') {
            const binding = bindings.get(object.name)
            if (binding && propName) {
              const method = 'imported' in binding ? binding.imported : propName
              const module = binding.module
              const { caps, api } = classifyMethodUse(file, module, method)
              for (const cap of caps) {
                const enriched =
                  cap === 'fs' && FS_READ_METHODS.has(method) && literals.some((l) => CREDENTIAL_PATH_RE.test(l))
                    ? [cap, 'secret-read' as Capability]
                    : [cap]
                for (const c of enriched) pushCap(c, line, api, literals, snippet)
              }
              if (BUILTIN_BASE[module]?.includes('net') && NET_METHODS.has(method)) {
                analysis.netUses.push({ file: file.path, line, api, literals, snippet })
              }
            } else if (object.name === 'String' && propName === 'fromCharCode') {
              const nums = args.filter((a) => a.type === 'Literal' && typeof (a as any).value === 'number')
              if (nums.length >= 8) {
                analysis.charcodeCalls.push({
                  file: file.path,
                  line,
                  chars: String.fromCharCode(...nums.map((a) => (a as any).value as number)).slice(0, 48),
                })
              }
            } else if (object.name === 'http' || object.name === 'https' || object.name === 'net') {
              // Unbound http.request(...) — globals people use without import.
              if (NET_METHODS.has(propName ?? '')) {
                analysis.netUses.push({ file: file.path, line, api: `${object.name}.${propName}`, literals, snippet })
                pushCap('net', line, `${object.name}.${propName}`, literals, snippet)
              }
            }
          } else if (object.type === 'MemberExpression' && isProcessEnv(object)) {
            pushCap('env', line, 'process.env', [], snippet)
          }
        }
        break
      }
      case 'ImportExpression': {
        const source = (n as any).source
        const value = staticString(source)
        const snippet = snippetAt(file.code, line)
        if (source?.type === 'Literal' && value !== null) {
          file.imports.push({ specifier: value, line })
          if (!value.startsWith('.')) file.externals.push(value)
        } else if (value !== null) {
          file.imports.push({ specifier: value, line })
          if (!value.startsWith('.')) file.externals.push(value)
          analysis.dynamicImports.push({ file: file.path, line, kind: 'import', literals: [value], snippet })
        } else {
          analysis.dynamicImports.push({ file: file.path, line, kind: 'import', literals: null, snippet })
        }
        break
      }
      case 'Literal': {
        const value = n.value
        if (typeof value === 'string' && value.length >= 48 && !/\s/.test(value)) {
          if (/^[A-Za-z0-9+/=]+$/.test(value) && /\d/.test(value) && /[A-Z]/.test(value)) {
            analysis.encodedLiterals.push({ file: file.path, line, value, charset: 'base64' })
          } else if (/^[0-9a-fA-F]+$/.test(value)) {
            // Palettes and tables reuse a handful of hex digits; encoded
            // payloads use the alphabet broadly. Calibrated on the v0.1
            // ecosystem sweep (docs/calibration-v0.1.md).
            const distinct = new Set(value).size
            if (distinct >= 8) analysis.encodedLiterals.push({ file: file.path, line, value, charset: 'hex' })
          }
        }
        break
      }
    }

    for (const [key, value] of Object.entries(n)) {
      if (key === 'loc' || key === 'start' || key === 'end' || key === 'range') continue
      if (Array.isArray(value)) {
        for (const child of value) visit(child)
      } else if (value && typeof value === 'object' && 'type' in value) {
        visit(value)
      }
    }
  }

  visit(ast)
}

// ---------------------------------------------------------------------------
// Module graph

function resolveRelative(rootDir: string, fromFile: string, spec: string): string | null {
  const base = resolve(rootDir, dirname(fromFile), spec)
  const candidates = [
    base,
    `${base}.js`,
    `${base}.cjs`,
    `${base}.mjs`,
    `${base}.json`,
    join(base, 'index.js'),
    join(base, 'index.cjs'),
    join(base, 'index.mjs'),
  ]
  for (const candidate of candidates) {
    try {
      readFileSync(candidate)
      return toPosix(relative(rootDir, candidate))
    } catch {
      // try next
    }
  }
  return null
}

function flattenExports(node: unknown, out: string[]): void {
  if (typeof node === 'string') out.push(node)
  else if (node && typeof node === 'object') {
    for (const value of Object.values(node as Record<string, unknown>)) flattenExports(value, out)
  }
}

function entryHints(pkg: PkgJson): string[] {
  const hints = new Set<string>()
  if (pkg.raw['main'] && typeof pkg.raw['main'] === 'string') hints.add(pkg.raw['main'])
  if (pkg.raw['module'] && typeof pkg.raw['module'] === 'string') hints.add(pkg.raw['module'])
  const exports = pkg.raw['exports']
  if (exports && typeof exports === 'object') {
    const flattened: string[] = []
    flattenExports(exports, flattened)
    for (const f of flattened) hints.add(f)
  }
  const bin = pkg.raw['bin']
  if (typeof bin === 'string') hints.add(bin)
  else if (bin && typeof bin === 'object') {
    for (const value of Object.values(bin as Record<string, unknown>)) {
      if (typeof value === 'string') hints.add(value)
    }
  }
  if (hints.size === 0) hints.add('index.js')
  return [...hints]
}

function readPkg(rootDir: string): PkgJson | null {
  try {
    const raw = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8')) as Record<string, unknown>
    const asRecord = (value: unknown): Record<string, string> =>
      value && typeof value === 'object' ? (value as Record<string, string>) : {}
    const dsh = raw['dsh'] as Record<string, unknown> | undefined
    const seams = Array.isArray(dsh?.['seams']) ? (dsh!['seams'] as string[]) : null
    const pkg: PkgJson = {
      raw,
      name: typeof raw['name'] === 'string' ? raw['name'] : '',
      version: typeof raw['version'] === 'string' ? raw['version'] : '',
      scripts: asRecord(raw['scripts']),
      dependencies: asRecord(raw['dependencies']),
      devDependencies: asRecord(raw['devDependencies']),
      seams,
      entryHints: [],
    }
    pkg.entryHints = entryHints(pkg)
    return pkg
  } catch {
    return null
  }
}

const byFileLine = (a: { file: string; line: number }, b: { file: string; line: number }) =>
  a.file.localeCompare(b.file) || a.line - b.line

/** Analyze a package directory: parse, walk, and build the module graph. */
export function analyze(rootDir: string): Analysis {
  const pkg = readPkg(rootDir)
  const analysis: Analysis = {
    rootDir,
    pkg,
    files: [],
    fileByPath: new Map(),
    entries: [],
    reachable: new Set(),
    unreachable: [],
    edges: new Map(),
    capUses: [],
    netUses: [],
    evalUses: [],
    dynamicImports: [],
    encodedLiterals: [],
    charcodeCalls: [],
  }

  for (const abs of listJsFiles(rootDir)) {
    const path = toPosix(relative(rootDir, abs))
    const code = readFileSync(abs, 'utf8')
    const parsed = parseSource(path, code)
    const file: SourceFile = {
      path,
      code,
      sourceType: parsed.sourceType,
      parseError: parsed.parseError,
      ast: parsed.ast,
      imports: [],
      externals: [],
    }
    analysis.files.push(file)
    analysis.fileByPath.set(path, file)
  }

  for (const file of analysis.files) {
    if (file.ast) inspectFile(analysis, file, file.ast)
    file.imports.sort((a, b) => a.specifier.localeCompare(b.specifier) || a.line - b.line)
    file.externals = [...new Set(file.externals)].sort()
  }

  // Entries: declared entry points, then anything package.json misses that
  // sits at the top level still gets excluded from `unreachable` noise below
  // only when reachable from an entry.
  const entries = new Set<string>()
  for (const hint of pkg?.entryHints ?? ['index.js']) {
    const rel = resolveRelative(rootDir, 'package.json', hint)
    if (rel && analysis.fileByPath.has(rel)) entries.add(rel)
  }
  const queue = [...entries].sort()
  const edges = new Map<string, string[]>()
  while (queue.length > 0) {
    const current = queue.shift()!
    if (analysis.reachable.has(current)) continue
    analysis.reachable.add(current)
    const file = analysis.fileByPath.get(current)
    if (!file) continue
    const targets: string[] = []
    for (const ref of file.imports) {
      if (!ref.specifier.startsWith('.')) continue
      const rel = resolveRelative(rootDir, current, ref.specifier)
      if (rel && analysis.fileByPath.has(rel)) {
        targets.push(rel)
        if (!analysis.reachable.has(rel)) queue.push(rel)
      }
    }
    edges.set(current, [...new Set(targets)].sort())
  }
  analysis.edges = edges
  analysis.entries = [...entries].sort()
  analysis.unreachable = analysis.files.map((f) => f.path).filter((p) => !analysis.reachable.has(p))

  analysis.capUses.sort((a, b) => byFileLine(a, b) || a.api.localeCompare(b.api) || a.cap.localeCompare(b.cap))
  analysis.netUses.sort(byFileLine)
  analysis.evalUses.sort(byFileLine)
  analysis.dynamicImports.sort(byFileLine)
  analysis.encodedLiterals.sort(byFileLine)
  analysis.charcodeCalls.sort(byFileLine)
  return analysis
}

/** All files statically reachable from `path` (excluding the path itself). */
export function reachableFrom(analysis: Analysis, path: string): Set<string> {
  const seen = new Set<string>()
  const queue = [path]
  while (queue.length > 0) {
    const current = queue.shift()!
    for (const next of analysis.edges.get(current) ?? []) {
      if (!seen.has(next)) {
        seen.add(next)
        queue.push(next)
      }
    }
  }
  return seen
}
