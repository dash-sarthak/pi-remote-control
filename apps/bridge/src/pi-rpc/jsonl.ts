/**
 * JSONL framing for pi's RPC stdout, as specified in pi's `docs/rpc.md`:
 * records are split on LF bytes only, an optional CR before the LF is
 * stripped, and nothing else (notably U+2028/U+2029) ends a record.
 */

const LF = 0x0a;
const CR = 0x0d;

/** One line of the stream: either a parsed JSON value or the reason it could not be parsed. */
export type DecodedLine =
  | { readonly kind: 'record'; readonly value: unknown }
  | { readonly kind: 'malformed'; readonly line: string; readonly reason: string };

/**
 * Incremental decoder for a JSONL byte stream.
 *
 * Bytes are buffered until an LF arrives, so records and multi-byte UTF-8
 * characters split across chunks are reassembled before decoding.
 */
export class JsonlDecoder {
  private pending: Uint8Array = new Uint8Array(0);
  private readonly utf8 = new TextDecoder('utf-8', { fatal: false });

  /**
   * Appends `chunk` and returns every line it completed, in stream order.
   * Blank lines are skipped.
   */
  push(chunk: Uint8Array): DecodedLine[] {
    const buffer = concat(this.pending, chunk);
    const lines: DecodedLine[] = [];
    let start = 0;
    for (let index = buffer.indexOf(LF); index !== -1; index = buffer.indexOf(LF, start)) {
      const end = index > start && buffer[index - 1] === CR ? index - 1 : index;
      const decoded = this.decodeLine(buffer.subarray(start, end));
      if (decoded !== undefined) lines.push(decoded);
      start = index + 1;
    }
    this.pending = buffer.slice(start);
    return lines;
  }

  /**
   * Signals end of stream. Bytes still buffered mean the last record was cut
   * off, which is reported as malformed rather than silently dropped.
   */
  end(): DecodedLine[] {
    const rest = this.pending;
    this.pending = new Uint8Array(0);
    const line = this.utf8.decode(rest).replace(/\r$/, '');
    if (line.trim().length === 0) return [];
    return [
      { kind: 'malformed', line, reason: 'stream ended before the record was terminated by LF' },
    ];
  }

  private decodeLine(bytes: Uint8Array): DecodedLine | undefined {
    const line = this.utf8.decode(bytes);
    if (line.trim().length === 0) return undefined;
    try {
      return { kind: 'record', value: JSON.parse(line) as unknown };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return { kind: 'malformed', line, reason: `invalid JSON: ${reason}` };
    }
  }
}

/**
 * Serializes `record` as one JSONL line terminated by LF.
 *
 * U+2028 and U+2029 are escaped as `\u2028`/`\u2029` so that even a reader
 * that wrongly treats them as line breaks receives the record intact.
 */
export function encodeJsonl(record: unknown): string {
  return `${JSON.stringify(record)
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')}\n`;
}

function concat(head: Uint8Array, tail: Uint8Array): Uint8Array {
  if (head.length === 0) return tail;
  const joined = new Uint8Array(head.length + tail.length);
  joined.set(head, 0);
  joined.set(tail, head.length);
  return joined;
}
