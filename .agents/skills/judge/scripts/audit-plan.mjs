/**
 * Pure decisions behind an audit run: which number comes next, which model
 * runs it, and how the judge session is started. No I/O, so the rules are
 * easy to test and to read.
 */

/** Harnesses the judge can run under. The caller always names one. */
export const HARNESSES = /** @type {const} */ (['claude-code', 'pi']);

/** Default model per harness: the strongest model each harness is configured for. */
export const DEFAULT_MODELS = /** @type {const} */ ({
  'claude-code': 'opus',
  pi: 'zai-coding-cn/glm-5.3',
});

/**
 * Extracts the audit numbers from names such as `audit/3`, `origin/audit/3`,
 * or a local directory name `3`. Names that do not end in a whole number are ignored.
 *
 * @param {readonly string[]} names
 * @returns {number[]}
 */
export function auditNumbers(names) {
  return names.flatMap((name) => {
    const match = /(?:^|\/)(0|[1-9]\d*)$/.exec(name.trim());
    return match?.[1] === undefined ? [] : [Number(match[1])];
  });
}

/**
 * The next audit number: one more than the highest already used, starting at 0.
 *
 * @param {readonly number[]} used - Numbers from remote `audit/*` branches and local `audit/*` directories.
 */
export function nextAuditNumber(used) {
  return used.length === 0 ? 0 : Math.max(...used) + 1;
}

/**
 * The prompt that starts the judge. It names the skill the way each harness
 * invokes skills explicitly, and states everything the skill's preconditions require.
 *
 * @param {{ audit: number, harness: (typeof HARNESSES)[number], model: string }} run
 */
export function judgePrompt({ audit, harness, model }) {
  const invoke = harness === 'pi' ? '/skill:judge' : '/judge';
  return `${invoke} Run audit ${audit}. Audit number: ${audit}. Harness: ${harness}. Model: ${model}. Write your output to audit/${audit}/.`;
}

/**
 * The command line that starts the judge in an isolated, memory-free session.
 *
 * Claude Code: the prompt comes first and `--allowedTools` is a single
 * `=` token, because that option is variadic and would otherwise swallow the
 * prompt. Project and user CLAUDE.md files and auto-memory are disabled,
 * only project settings load, and the session is not saved. pi: context
 * files, extensions, discovered skills, prompt templates, and project-local
 * files are disabled, the judge skill is loaded by path, and the session is not saved.
 *
 * @param {{ audit: number, harness: (typeof HARNESSES)[number], model: string, worktree: string }} run
 * @returns {{ command: string, args: string[], env: Record<string, string> }}
 */
export function judgeCommand({ audit, harness, model, worktree }) {
  const prompt = judgePrompt({ audit, harness, model });
  if (harness === 'pi') {
    return {
      command: 'pi',
      args: [
        '--print',
        '--model',
        model,
        '--no-session',
        '--no-context-files',
        '--no-extensions',
        '--no-skills',
        '--no-prompt-templates',
        '--no-approve',
        '--skill',
        `${worktree}/.agents/skills/judge`,
        prompt,
      ],
      env: {},
    };
  }
  return {
    command: 'claude',
    args: [
      prompt,
      '--print',
      '--model',
      model,
      '--setting-sources',
      'project',
      '--no-session-persistence',
      '--allowedTools=Bash,Read,Write,Edit,Glob,Grep',
    ],
    env: { CLAUDE_CODE_DISABLE_CLAUDE_MDS: '1', CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1' },
  };
}
