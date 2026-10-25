import { describe, expect, it } from 'vitest';
import { JsonlDecoder, encodeJsonl } from '../src/pi-rpc/jsonl.js';

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);

/** Feeds every chunk to a fresh decoder and returns everything it produced, including at end of stream. */
function decodeAll(chunks: readonly Uint8Array[]): ReturnType<JsonlDecoder['push']> {
  const decoder = new JsonlDecoder();
  return [...chunks.flatMap((chunk) => decoder.push(chunk)), ...decoder.end()];
}

describe('JSONL framing of the pi RPC byte stream', () => {
  it('yields one record per LF-terminated line', () => {
    expect(decodeAll([bytes('{"a":1}\n{"b":2}\n')])).toEqual([
      { kind: 'record', value: { a: 1 } },
      { kind: 'record', value: { b: 2 } },
    ]);
  });

  it('accepts CRLF line endings', () => {
    expect(decodeAll([bytes('{"a":1}\r\n')])).toEqual([{ kind: 'record', value: { a: 1 } }]);
  });

  it('keeps U+2028 and U+2029 inside a string as part of the record', () => {
    const text = 'line\u2028separator\u2029paragraph';
    expect(decodeAll([bytes(`${JSON.stringify({ text })}\n`)])).toEqual([
      { kind: 'record', value: { text } },
    ]);
  });

  it('reassembles a record split across chunks, including mid-way through a multi-byte character', () => {
    const encoded = bytes('{"emoji":"📱"}\n');
    const splitInsideEmoji = 12;
    expect(
      decodeAll([encoded.slice(0, splitInsideEmoji), encoded.slice(splitInsideEmoji)]),
    ).toEqual([{ kind: 'record', value: { emoji: '📱' } }]);
  });

  it('ignores blank lines', () => {
    expect(decodeAll([bytes('\n\r\n{"a":1}\n\n')])).toEqual([{ kind: 'record', value: { a: 1 } }]);
  });

  it('reports a line that is not JSON as malformed and keeps decoding the next line', () => {
    expect(decodeAll([bytes('not json\n{"a":1}\n')])).toEqual([
      { kind: 'malformed', line: 'not json', reason: expect.stringContaining('JSON') as unknown },
      { kind: 'record', value: { a: 1 } },
    ]);
  });

  it('reports bytes left without a trailing LF at end of stream as a truncated record', () => {
    expect(decodeAll([bytes('{"a":1}\n{"b":')])).toEqual([
      { kind: 'record', value: { a: 1 } },
      {
        kind: 'malformed',
        line: '{"b":',
        reason: 'stream ended before the record was terminated by LF',
      },
    ]);
  });

  it('encodes a command as exactly one LF-terminated line, escaping U+2028 so no reader can split it', () => {
    const line = encodeJsonl({ type: 'prompt', message: 'a\nb\u2028c' });
    expect(line).toBe('{"type":"prompt","message":"a\\nb\\u2028c"}\n');
    expect(decodeAll([bytes(line)])).toEqual([
      { kind: 'record', value: { type: 'prompt', message: 'a\nb\u2028c' } },
    ]);
  });
});
