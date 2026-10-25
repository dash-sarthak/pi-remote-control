/**
 * ESLint plugin with this repository's own rules. Registered as `pirc` in
 * every workspace's ESLint config.
 */

/**
 * A run of three or more divider characters: `-`, `=`, `#`, `*`, `~`, `_`,
 * `+`, or Unicode box-drawing lines.
 */
const DIVIDER_RUN = /[-=#*~_+─-╿]{3,}/u;

/**
 * Returns true when a comment's text starts or ends with a divider run, which
 * is what banner and section-divider comments look like. Divider characters
 * inside prose, such as `a --> b`, are not matched.
 *
 * @param {string} text - Comment body without the comment delimiters.
 */
function isBanner(text) {
  const lines = text
    .split('\n')
    .map((line) => line.replace(/^\s*\*?\s?/, '').trim())
    .filter((line) => line.length > 0);
  return lines.some((line) => {
    const head = line.match(/^\S+/u)?.[0] ?? '';
    const tail = line.match(/\S+$/u)?.[0] ?? '';
    return (
      (DIVIDER_RUN.test(head) && /^[^\p{L}\p{N}]+$/u.test(head)) ||
      (DIVIDER_RUN.test(tail) && /^[^\p{L}\p{N}>]+$/u.test(tail))
    );
  });
}

/** @type {import('eslint').Rule.RuleModule} */
const noBannerComments = {
  meta: {
    type: 'suggestion',
    docs: { description: 'Disallow banner and divider comments such as `// --- section ---`.' },
    schema: [],
    messages: {
      banner:
        'Banner and divider comments are not allowed. Split the file or name the section with a function or module instead.',
    },
  },
  create(context) {
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          if (isBanner(comment.value)) {
            context.report({ loc: comment.loc ?? { line: 1, column: 0 }, messageId: 'banner' });
          }
        }
      },
    };
  },
};

/** The `pirc` ESLint plugin. */
const plugin = {
  meta: { name: '@pirc/eslint-plugin' },
  rules: { 'no-banner-comments': noBannerComments },
};

export default plugin;
