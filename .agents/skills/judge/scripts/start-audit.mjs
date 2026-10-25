#!/usr/bin/env node
/**
 * Starts audit N in a fresh, isolated judge session and publishes the result.
 *
 * Usage:
 *   node .agents/skills/judge/scripts/start-audit.mjs [--harness claude-code|pi] [--model ID] [--if-due] [--dry-run]
 *
 * Steps: fetch origin; pick the next audit number and harness; create a git
 * worktree on a new `audit/N` branch from `origin/main`; run the judge there
 * with no project instructions, memory, or saved sessions; validate its
 * `audit/N/findings.json`; commit `audit/N/` on the branch, push it, open the
 * `audit/N` issue; copy `audit/N/` into this checkout; remove the worktree.
 *
 * `--if-due` exits without doing anything unless 15 days have passed since the
 * latest audit. `--dry-run` prints the plan as JSON and changes nothing.
 * Logs are JSON lines on stderr. Exit codes: 0 done or not due, 1 failure, 2 bad usage.
 */
import { execFileSync, spawn } from 'node:child_process';
import { cpSync, createWriteStream, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {
  auditNumbers,
  DEFAULT_MODELS,
  HARNESSES,
  harnessFor,
  isAuditDue,
  judgeCommand,
  nextAuditNumber,
} from './audit-plan.mjs';

/** Upper bound on one judge session. */
const JUDGE_TIMEOUT_MS = 4 * 60 * 60 * 1000;

/**
 * Writes one structured log line to stderr.
 *
 * @param {'info' | 'warn' | 'error'} level
 * @param {string} msg
 * @param {Record<string, unknown>} [fields]
 */
function log(level, msg, fields = {}) {
  process.stderr.write(
    `${JSON.stringify({ time: new Date().toISOString(), level, component: 'start-audit', msg, ...fields })}\n`,
  );
}

/**
 * Runs a command without a shell and returns its trimmed stdout.
 *
 * @param {string} command
 * @param {readonly string[]} args
 * @param {string} cwd
 */
function run(command, args, cwd) {
  return execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

/**
 * Collects everything the plan depends on from git and the filesystem.
 *
 * @param {string} repoRoot
 * @param {boolean} hasOrigin
 */
function readAuditHistory(repoRoot, hasOrigin) {
  const remoteBranches = hasOrigin
    ? run(
        'git',
        ['for-each-ref', '--format=%(refname:short)', 'refs/remotes/origin/audit/'],
        repoRoot,
      )
        .split('\n')
        .filter(Boolean)
    : [];
  const localDir = join(repoRoot, 'audit');
  const localDirs = existsSync(localDir) ? readdirSync(localDir) : [];
  const used = [...auditNumbers(remoteBranches), ...auditNumbers(localDirs)];
  const latest = used.length === 0 ? undefined : Math.max(...used);
  let lastAuditDate;
  if (latest !== undefined && remoteBranches.includes(`origin/audit/${latest}`)) {
    lastAuditDate = run('git', ['log', '-1', '--format=%cs', `origin/audit/${latest}`], repoRoot);
  } else if (latest !== undefined) {
    lastAuditDate = run('git', ['log', '-1', '--format=%cs'], repoRoot);
  }
  return { used, lastAuditDate };
}

/**
 * Runs the judge, mirroring its output to the terminal and to `logPath`.
 *
 * @param {{ command: string, args: string[], env: Record<string, string> }} judge
 * @param {string} cwd
 * @param {string} logPath
 * @returns {Promise<number | null>} The judge's exit code.
 */
function runJudge(judge, cwd, logPath) {
  return new Promise((resolvePromise, reject) => {
    const logFile = createWriteStream(logPath);
    const child = spawn(judge.command, judge.args, {
      cwd,
      env: { ...process.env, ...judge.env },
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: JUDGE_TIMEOUT_MS,
    });
    for (const stream of [child.stdout, child.stderr]) {
      stream.on('data', (chunk) => {
        logFile.write(chunk);
        process.stderr.write(chunk);
      });
    }
    child.once('error', reject);
    child.once('close', (code) => logFile.end(() => resolvePromise(code)));
  });
}

/** Parses the command line, plans the audit, and carries it out. Returns the exit code. */
async function main() {
  let options;
  try {
    options = parseArgs({
      options: {
        harness: { type: 'string' },
        model: { type: 'string' },
        'if-due': { type: 'boolean', default: false },
        'dry-run': { type: 'boolean', default: false },
      },
    }).values;
  } catch (error) {
    log('error', 'invalid arguments', {
      reason: error instanceof Error ? error.message : String(error),
    });
    return 2;
  }
  if (
    options.harness !== undefined &&
    !HARNESSES.includes(/** @type {never} */ (options.harness))
  ) {
    log('error', 'invalid arguments', {
      reason: `--harness must be one of ${HARNESSES.join(', ')}`,
    });
    return 2;
  }

  const repoRoot = run(
    'git',
    ['rev-parse', '--show-toplevel'],
    fileURLToPath(new URL('.', import.meta.url)),
  );
  const hasOrigin = run('git', ['remote'], repoRoot).split('\n').includes('origin');
  if (hasOrigin) run('git', ['fetch', 'origin', '--prune'], repoRoot);

  const { used, lastAuditDate } = readAuditHistory(repoRoot, hasOrigin);
  const today = new Date().toISOString().slice(0, 10);
  const audit = nextAuditNumber(used);
  const harness = /** @type {(typeof HARNESSES)[number]} */ (options.harness ?? harnessFor(audit));
  const model = options.model ?? DEFAULT_MODELS[harness];
  const cacheHome = process.env['XDG_CACHE_HOME'] ?? join(homedir(), '.cache');
  const worktree = resolve(cacheHome, 'pirc-audit', `audit-${audit}`);
  const judge = judgeCommand({ audit, harness, model, worktree });
  const plan = {
    audit,
    branch: `audit/${audit}`,
    harness,
    model,
    worktree,
    lastAuditDate,
    due: isAuditDue(lastAuditDate, today),
    judge,
  };

  if (options['dry-run']) {
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    return 0;
  }
  if (options['if-due'] && !plan.due) {
    log('info', 'audit not due', { lastAuditDate, today });
    return 0;
  }
  if (!hasOrigin) {
    log('error', 'an "origin" remote is required to push the audit branch and open the issue');
    return 1;
  }

  log('info', 'starting audit', plan);
  run('git', ['worktree', 'add', '-b', plan.branch, worktree, 'origin/main'], repoRoot);
  const outputDir = join(worktree, 'audit', String(audit));
  mkdirSync(outputDir, { recursive: true });
  const localCopy = join(repoRoot, 'audit', String(audit));
  mkdirSync(localCopy, { recursive: true });

  const exitCode = await runJudge(judge, worktree, join(localCopy, 'session.log'));
  if (exitCode !== 0) {
    log('error', 'judge session failed; worktree kept for inspection', { exitCode, worktree });
    return 1;
  }
  const validator = fileURLToPath(new URL('./validate-findings.mjs', import.meta.url));
  try {
    run(process.execPath, [validator, join(outputDir, 'findings.json')], worktree);
  } catch (error) {
    log('error', 'judge output is invalid; worktree kept for inspection', {
      worktree,
      stderr: String(/** @type {{ stderr?: unknown }} */ (error).stderr ?? error),
    });
    return 1;
  }

  run(
    'git',
    ['add', '--force', `audit/${audit}/findings.json`, `audit/${audit}/report.md`],
    worktree,
  );
  run('git', ['commit', '-m', `docs(audit): record audit/${audit} findings`], worktree);
  run('git', ['push', '--set-upstream', 'origin', plan.branch], worktree);
  run(
    'gh',
    [
      'label',
      'create',
      'audit',
      '--description',
      'Periodic independent audit',
      '--color',
      '5319e7',
      '--force',
    ],
    worktree,
  );
  const issueUrl = run(
    'gh',
    [
      'issue',
      'create',
      '--title',
      plan.branch,
      '--label',
      'audit',
      '--body-file',
      join(outputDir, 'report.md'),
    ],
    worktree,
  );
  cpSync(outputDir, localCopy, { recursive: true });
  run('git', ['worktree', 'remove', '--force', worktree], repoRoot);
  log('info', 'audit published', { audit, branch: plan.branch, issueUrl, localCopy });
  return 0;
}

process.exitCode = await main().catch((error) => {
  log('error', 'audit failed', {
    err: {
      message: error instanceof Error ? error.message : String(error),
      stderr: String(error?.stderr ?? ''),
    },
  });
  return 1;
});
