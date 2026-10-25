import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { renderUnits } from '../../../.agents/skills/judge/scripts/schedule-audits.mjs';
import {
  auditNumbers,
  harnessFor,
  isAuditDue,
  judgeCommand,
  nextAuditNumber,
} from '../../../.agents/skills/judge/scripts/audit-plan.mjs';
import {
  parseRubric,
  validateFindings,
} from '../../../.agents/skills/judge/scripts/validate-findings.mjs';

const SKILL_DIR = fileURLToPath(new URL('../../../.agents/skills/judge', import.meta.url));
const rubric = parseRubric(readFileSync(join(SKILL_DIR, 'references/rubric.md'), 'utf8'));

const temporaryDirs: string[] = [];
afterEach(() => {
  for (const dir of temporaryDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A findings.json that satisfies the report format, answering every rubric check with pass. */
function validReport(): Record<string, unknown> {
  return {
    audit: 0,
    rubricVersion: rubric.version,
    date: '2026-10-25',
    commit: 'a'.repeat(40),
    harness: 'claude-code',
    model: 'opus',
    summary: 'A bridge and a phone app.',
    steps: [
      {
        source: 'RUNBOOK.md#x',
        command: 'pnpm test',
        exitCode: 0,
        expected: 'green',
        actual: 'green',
        result: 'pass',
      },
    ],
    checks: rubric.checkIds.map((id) => ({ id, result: 'pass', findings: [] })),
    findings: [],
    previousAudit: [],
  };
}

describe('audit numbering, schedule, and harness choice', () => {
  it('starts at 0 and continues after the highest number seen on branches or local directories', () => {
    expect(nextAuditNumber(auditNumbers([]))).toBe(0);
    expect(
      nextAuditNumber(auditNumbers(['origin/audit/0', 'origin/audit/2', '1', 'notes', 'audit/x'])),
    ).toBe(3);
  });

  it('is due for the first audit and again only after 15 days', () => {
    expect(isAuditDue(undefined, '2026-10-25')).toBe(true);
    expect(isAuditDue('2026-10-10', '2026-10-24')).toBe(false);
    expect(isAuditDue('2026-10-10', '2026-10-25')).toBe(true);
  });

  it('alternates harnesses: even audits on Claude Code, odd audits on pi', () => {
    expect([0, 1, 2, 3].map(harnessFor)).toEqual(['claude-code', 'pi', 'claude-code', 'pi']);
  });

  it('starts Claude Code with CLAUDE.md files, auto-memory, user settings, and session saving disabled', () => {
    const judge = judgeCommand({ audit: 4, harness: 'claude-code', model: 'opus', worktree: '/w' });
    expect(judge.command).toBe('claude');
    expect(judge.env).toEqual({
      CLAUDE_CODE_DISABLE_CLAUDE_MDS: '1',
      CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1',
    });
    expect(judge.args).toEqual(
      expect.arrayContaining([
        '--print',
        '--setting-sources',
        'project',
        '--no-session-persistence',
      ]),
    );
    expect(judge.args[0]).toMatch(/^\/judge Run audit 4\. Audit number: 4\./);
    expect(judge.args).toContain('--allowedTools=Bash,Read,Write,Edit,Glob,Grep');
  });

  it('starts pi with context files, extensions, discovered skills, project files, and sessions disabled', () => {
    const judge = judgeCommand({
      audit: 5,
      harness: 'pi',
      model: 'zai-coding-cn/glm-5.3',
      worktree: '/w',
    });
    expect(judge.command).toBe('pi');
    expect(judge.args).toEqual(
      expect.arrayContaining([
        '--print',
        '--no-session',
        '--no-context-files',
        '--no-extensions',
        '--no-skills',
        '--no-approve',
        '--skill',
        '/w/.agents/skills/judge',
      ]),
    );
    expect(judge.args.at(-1)).toMatch(/^\/skill:judge Run audit 5\. Audit number: 5\./);
  });
});

describe('findings.json validation', () => {
  it('reads every check id and the version from the rubric', () => {
    expect(rubric.version).toBe(1);
    expect(rubric.checkIds).toEqual(
      expect.arrayContaining([
        'O1',
        'H1',
        'L1',
        'C1',
        'T1',
        'K1',
        'D1',
        'TL4',
        'CI1',
        'HY1',
        'S1',
        'P1',
      ]),
    );
  });

  it('accepts a complete report', () => {
    expect(validateFindings(validReport(), rubric)).toEqual([]);
  });

  it('rejects a failed check without a finding, a finding without evidence, and an unanswered check', () => {
    const report = validReport();
    const checks = report.checks as { id: string; result: string }[];
    checks.pop();
    checks[0] = { id: 'O1', result: 'fail' };
    report.findings = [
      {
        id: 'F-001',
        check: 'O2',
        severity: 'high',
        title: 't',
        evidence: [],
        expected: 'e',
        actual: 'a',
        recommendation: 'r',
        previous: null,
      },
    ];
    expect(validateFindings(report, rubric)).toEqual([
      'findings[0].evidence must list at least one non-empty string',
      'checks[0] failed but lists no findings',
      `checks is missing rubric check ${rubric.checkIds.at(-1) ?? ''}`,
    ]);
  });

  it('exits 1 from the command line and prints the problems when the report is invalid', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pirc-findings-'));
    temporaryDirs.push(dir);
    writeFileSync(
      join(dir, 'findings.json'),
      JSON.stringify({ ...validReport(), severity: undefined, harness: 'cursor' }),
    );
    const result = spawnSync(
      process.execPath,
      [join(SKILL_DIR, 'scripts/validate-findings.mjs'), join(dir, 'findings.json')],
      { encoding: 'utf8' },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toBe('harness must be "claude-code" or "pi"\n');
  });
});

describe('start-audit --dry-run', () => {
  /** Creates a git repository containing a copy of the judge skill, with audits 0 and 1 already published to its origin. */
  function makeRepoWithTwoAudits(): string {
    const root = mkdtempSync(join(tmpdir(), 'pirc-audit-repo-'));
    temporaryDirs.push(root);
    const origin = join(root, 'origin.git');
    const repo = join(root, 'repo');
    const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, stdio: 'pipe' });
    execFileSync('git', ['init', '--bare', '--initial-branch=main', origin], { stdio: 'pipe' });
    mkdirSync(repo);
    git('init', '--initial-branch=main');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'Test');
    cpSync(SKILL_DIR, join(repo, '.agents/skills/judge'), { recursive: true });
    git('add', '.');
    git('commit', '-m', 'chore: init', '--no-verify');
    git('remote', 'add', 'origin', origin);
    git('push', 'origin', 'main', 'main:audit/0', 'main:audit/1');
    return repo;
  }

  it('plans audit 2 on Claude Code without creating branches or worktrees', () => {
    const repo = makeRepoWithTwoAudits();
    const cacheHome = join(repo, '..', 'cache');
    const result = spawnSync(
      process.execPath,
      ['.agents/skills/judge/scripts/start-audit.mjs', '--dry-run'],
      {
        cwd: repo,
        encoding: 'utf8',
        env: { ...process.env, XDG_CACHE_HOME: cacheHome },
      },
    );
    expect(result.status).toBe(0);
    const plan = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(plan).toMatchObject({
      audit: 2,
      branch: 'audit/2',
      harness: 'claude-code',
      model: 'opus',
      worktree: join(cacheHome, 'pirc-audit', 'audit-2'),
      due: false,
    });
    expect(
      execFileSync('git', ['branch', '--list', 'audit/*'], { cwd: repo, encoding: 'utf8' }),
    ).toBe('');
  });

  it('honours --harness pi and --model', () => {
    const repo = makeRepoWithTwoAudits();
    const result = spawnSync(
      process.execPath,
      [
        '.agents/skills/judge/scripts/start-audit.mjs',
        '--dry-run',
        '--harness',
        'pi',
        '--model',
        'zai-coding-cn/glm-5.3-flash',
      ],
      {
        cwd: repo,
        encoding: 'utf8',
      },
    );
    expect(JSON.parse(result.stdout)).toMatchObject({
      audit: 2,
      harness: 'pi',
      model: 'zai-coding-cn/glm-5.3-flash',
    });
  });

  it('rejects an unknown harness with exit code 2', () => {
    const repo = makeRepoWithTwoAudits();
    const result = spawnSync(
      process.execPath,
      ['.agents/skills/judge/scripts/start-audit.mjs', '--harness', 'cursor'],
      { cwd: repo, encoding: 'utf8' },
    );
    expect(result.status).toBe(2);
    expect(JSON.parse(result.stderr.trim()) as unknown).toMatchObject({
      level: 'error',
      msg: 'invalid arguments',
    });
  });
});

describe('audit schedule', () => {
  it('fires daily, catches up after downtime, and starts the launcher only-if-due from the checkout', () => {
    const { service, timer } = renderUnits({
      repoRoot: '/repo',
      nodePath: '/usr/bin/node',
      pathEnv: '/bin',
    });
    expect(timer).toContain('OnCalendar=*-*-* 09:00:00\nPersistent=true');
    expect(service).toContain('WorkingDirectory=/repo');
    expect(service).toContain(
      'ExecStart=/usr/bin/node /repo/.agents/skills/judge/scripts/start-audit.mjs --if-due',
    );
  });
});
