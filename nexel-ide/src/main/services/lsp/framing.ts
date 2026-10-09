/** LSP base-protocol framing: "Content-Length: N\r\n\r\n<json>" over a byte stream. */
export const MAX_FRAME_BYTES = 8 * 1024 * 1024;

export function encodeFrame(msg: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(msg), 'utf8');
  return Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, 'ascii'), body]);
}

export class FrameDecoder {
  private buf: Buffer = Buffer.alloc(0);
  /** Feed a chunk; returns every complete JSON message. Malformed frames are skipped, oversized ones throw. */
  push(chunk: Buffer): unknown[] {
    this.buf = Buffer.concat([this.buf, chunk]);
    const out: unknown[] = [];
    for (;;) {
      const headEnd = this.buf.indexOf('\r\n\r\n');
      if (headEnd < 0) break;
      const m = /Content-Length:\s*(\d+)/i.exec(this.buf.subarray(0, headEnd).toString('ascii'));
      if (!m) { this.buf = this.buf.subarray(headEnd + 4); continue; }
      const len = Number(m[1]);
      if (len > MAX_FRAME_BYTES) { this.buf = Buffer.alloc(0); throw new Error('lsp: frame too large'); }
      const start = headEnd + 4;
      if (this.buf.length < start + len) break;
      const body = this.buf.subarray(start, start + len).toString('utf8');
      this.buf = this.buf.subarray(start + len);
      try { out.push(JSON.parse(body)); } catch { /* skip bad JSON */ }
    }
    return out;
  }
}
