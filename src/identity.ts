/**
 * Content identity for analysis inputs: the versioned digest that ties a
 * report to the exact bytes analysis consumed. See
 * `docs/scan-context-v1.md` (subject area) for the semantics this
 * implements.
 *
 * The digest is over a canonical manifest of the captured input snapshots
 * — relative POSIX paths, byte lengths, and per-file SHA-256 — never over
 * a second filesystem walk. The same snapshots the analyzer read are the
 * ones hashed here; a source directory and its built package are therefore
 * different identities, which is the point.
 *
 * This is not full-package integrity: files analysis does not read (a
 * README, an asset) do not participate. The archive digest covers exact
 * archive bytes instead; the two must never be conflated.
 *
 * @module dsh-vet/identity
 */

import { ANALYSIS_INPUT_DIGEST_KIND, canonicalJson, sha256Hex } from './scan-context.ts'

/** Digest semantics version this module produces (defined by the extension spec). */
export { ANALYSIS_INPUT_DIGEST_KIND }

/** One captured input: a package-relative path and the exact bytes analysis read. */
export interface AnalysisInput {
  /** Package-relative POSIX path, e.g. `lib/helper.js` or `package.json`. */
  path: string
  /** Exact bytes at the moment analysis read them; never re-read from disk. */
  bytes: Uint8Array
}

/**
 * SHA-256 over the canonical analysis-input manifest: entries sorted by
 * path, each `{ bytes, path, sha256 }`, canonical JSON, hashed as UTF-8.
 * Deterministic across machines — absolute roots and timestamps excluded.
 */
export function analysisInputDigest(inputs: readonly AnalysisInput[]): string {
  const manifest = [...inputs]
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map((input) => ({
      bytes: input.bytes.byteLength,
      path: input.path,
      sha256: sha256Hex(input.bytes),
    }))
  return `sha256:${sha256Hex(canonicalJson(manifest))}`
}
