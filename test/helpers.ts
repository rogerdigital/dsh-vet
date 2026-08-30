import { Buffer } from 'node:buffer'
import { gzipSync } from 'node:zlib'

/** Build a ustar buffer the way `npm pack` roughly does (rooted at package/). */
export function buildTar(
  entries: Array<{ name: string; data?: string | Buffer; type?: string; linkname?: string; mode?: number }>,
): Buffer {
  const blocks: Buffer[] = []
  for (const entry of entries) {
    const data = entry.data ?? ''
    const body = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8')
    const header = Buffer.alloc(512)
    const type = entry.type ?? (body ? '0' : '5')
    const size = type === '5' ? 0 : body.length
    header.write(entry.name.slice(0, 99), 0, 100, 'utf8')
    header.write((entry.mode ?? 0o644).toString(8).padStart(6, '0') + '\0', 100, 8)
    header.write(size.toString(8).padStart(11, '0') + '\0', 124, 12)
    header.write('00000000000\0', 136, 12) // mtime
    header.write('        ', 148, 8) // checksum placeholder: spaces
    header.write(type, 156, 1)
    if (entry.linkname) header.write(entry.linkname, 157, 100)
    header.write('ustar\0', 257, 6)
    header.write('00', 263, 2)
    let checksum = 0
    for (const byte of header) checksum += byte
    header.write(checksum.toString(8).padStart(6, '0') + '\0 ', 148, 8)
    blocks.push(header, body)
    const pad = (512 - (size % 512)) % 512
    if (pad) blocks.push(Buffer.alloc(pad))
  }
  blocks.push(Buffer.alloc(1024)) // end-of-archive
  return Buffer.concat(blocks)
}

export function gzippedTar(
  entries: Array<{ name: string; data?: string | Buffer; type?: string; mode?: number }>,
): Buffer {
  return gzipSync(buildTar(entries))
}

/** Minimal Response stand-in for an injected fetch. */
export function fakeResponse(body: unknown, init: { status?: number } = {}): Response {
  const status = init.status ?? 200
  if (typeof body === 'string' || Buffer.isBuffer(body)) {
    return { ok: status >= 200 && status < 300, status } as unknown as Response
  }
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response
}

export function fakeFetchBody(bytes: Buffer, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, arrayBuffer: async () => bytes } as unknown as Response
}
