import { describe, expect, it } from 'vitest';
import { ENVELOPE_TYPES, isEnvelope } from '../src/index.js';

describe('isEnvelope: validating phone ⇄ bridge messages', () => {
  it.each(ENVELOPE_TYPES)('accepts a "%s" envelope', (type) => {
    expect(isEnvelope({ type, sessionId: 's1', correlationId: 'c1', payload: {} })).toBe(true);
  });

  it('accepts an envelope without a correlationId', () => {
    expect(isEnvelope({ type: 'event', sessionId: 's1', payload: null })).toBe(true);
  });

  it.each([
    ['an unknown type', { type: 'shutdown', sessionId: 's1', payload: {} }],
    ['a missing sessionId', { type: 'command', payload: {} }],
    ['an empty sessionId', { type: 'command', sessionId: '', payload: {} }],
    [
      'a non-string correlationId',
      { type: 'command', sessionId: 's1', correlationId: 7, payload: {} },
    ],
    ['a missing payload', { type: 'command', sessionId: 's1' }],
    ['an array', []],
    ['a string', 'nope'],
    ['null', null],
  ])('rejects %s', (_case, value) => {
    expect(isEnvelope(value)).toBe(false);
  });
});
