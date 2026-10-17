import { describe, expect, it } from 'vitest';
import { isEnvelope } from '../src/index.js';

describe('isEnvelope', () => {
  it('accepts a valid envelope', () => {
    expect(
      isEnvelope({
        type: 'command',
        sessionId: 's1',
        correlationId: 'c1',
        payload: {},
      }),
    ).toBe(true);
  });

  it('rejects missing sessionId, empty sessionId, and non-objects', () => {
    expect(isEnvelope({ type: 'command', payload: {} })).toBe(false);
    expect(isEnvelope({ type: 'command', sessionId: '', payload: {} })).toBe(
      false,
    );
    expect(isEnvelope('nope')).toBe(false);
    expect(isEnvelope(null)).toBe(false);
  });
});
