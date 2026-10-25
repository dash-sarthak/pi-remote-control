import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';
import plugin from '../src/eslint-plugin.js';

/** Lints `source` with only the rule under test enabled and returns the reported messages. */
function lint(source: string): string[] {
  const linter = new Linter({ configType: 'flat' });
  return linter
    .verify(source, [{ plugins: { pirc: plugin }, rules: { 'pirc/no-banner-comments': 'error' } }])
    .map((message) => message.message);
}

const BANNER_MESSAGE =
  'Banner and divider comments are not allowed. Split the file or name the section with a function or module instead.';

describe('lint rule pirc/no-banner-comments', () => {
  it.each([
    ['dash banner', '// --- setup ---\nconst a = 1;'],
    ['equals divider', '// ==========\nconst a = 1;'],
    ['hash banner', '// ### helpers ###\nconst a = 1;'],
    ['star banner block', '/* ***** config ***** */\nconst a = 1;'],
    ['trailing dashes', '// helpers -----\nconst a = 1;'],
    ['box-drawing divider', '// ──────── state ────────\nconst a = 1;'],
  ])('rejects a %s', (_name, source) => {
    expect(lint(source)).toEqual([BANNER_MESSAGE]);
  });

  it.each([
    [
      'plain comment',
      '// Retry once because pi drops the first request after a restart.\nconst a = 1;',
    ],
    [
      'docstring',
      '/**\n * Adds one.\n * @param n - Input.\n */\nfunction inc(n) { return n + 1; }',
    ],
    ['arrow in prose', '// a --> b is the order pi emits them\nconst a = 1;'],
    ['markdown list in docstring', '/**\n * Steps:\n * - spawn\n * - read\n */\nconst a = 1;'],
  ])('accepts a %s', (_name, source) => {
    expect(lint(source)).toEqual([]);
  });
});
