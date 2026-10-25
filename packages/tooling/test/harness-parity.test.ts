import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { checkHarnessParity } from '../src/harness-parity.js';

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));

let fixture: string | undefined;

afterEach(async () => {
  if (fixture !== undefined) await rm(fixture, { recursive: true, force: true });
  fixture = undefined;
});

/** Builds a temporary repository from `files` (path → content) and `links` (path → symlink target). */
async function makeRepo(
  files: Record<string, string>,
  links: Record<string, string> = {},
): Promise<string> {
  fixture = await mkdtemp(join(tmpdir(), 'pirc-parity-'));
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(fixture, path)), { recursive: true });
    await writeFile(join(fixture, path), content);
  }
  for (const [path, target] of Object.entries(links)) {
    await mkdir(dirname(join(fixture, path)), { recursive: true });
    await symlink(target, join(fixture, path));
  }
  return fixture;
}

const SKILL = '---\nname: judge\ndescription: Audits the repository.\n---\n\n# Judge\n';

/** A repository laid out the way harness parity requires. */
async function makeCompliantRepo(): Promise<string> {
  return makeRepo(
    {
      'AGENTS.md': '# rules\n',
      'apps/x/AGENTS.md': '# x rules\n',
      '.pi/mcp.json': '{}',
      '.agents/skills/judge/SKILL.md': SKILL,
    },
    {
      'CLAUDE.md': 'AGENTS.md',
      'apps/x/CLAUDE.md': 'AGENTS.md',
      '.mcp.json': '.pi/mcp.json',
      '.claude/skills': '../.agents/skills',
    },
  );
}

describe('harness parity: Claude Code and pi load identical instructions, skills, and MCP servers', () => {
  it('this repository satisfies harness parity', async () => {
    expect(await checkHarnessParity(REPO_ROOT)).toEqual([]);
  });

  it('accepts a compliant layout', async () => {
    expect(await checkHarnessParity(await makeCompliantRepo())).toEqual([]);
  });

  it('reports an AGENTS.md without a CLAUDE.md symlink beside it', async () => {
    const root = await makeRepo(
      { 'AGENTS.md': '# rules\n', '.pi/mcp.json': '{}' },
      { '.mcp.json': '.pi/mcp.json', '.claude/skills': '../.agents/skills' },
    );
    await mkdir(join(root, '.agents/skills'), { recursive: true });
    expect(await checkHarnessParity(root)).toEqual([
      'CLAUDE.md must be a symlink to AGENTS.md (Claude Code reads CLAUDE.md, pi reads AGENTS.md)',
    ]);
  });

  it('reports a CLAUDE.md that is a separate file instead of a symlink', async () => {
    const root = await makeCompliantRepo();
    await rm(join(root, 'apps/x/CLAUDE.md'));
    await writeFile(join(root, 'apps/x/CLAUDE.md'), '# x rules\n');
    expect(await checkHarnessParity(root)).toEqual([
      'apps/x/CLAUDE.md must be a symlink to AGENTS.md (Claude Code reads CLAUDE.md, pi reads AGENTS.md)',
    ]);
  });

  it('reports a missing .mcp.json link and a missing .claude/skills link', async () => {
    const root = await makeRepo(
      { 'AGENTS.md': '# rules\n', '.pi/mcp.json': '{}', '.agents/skills/judge/SKILL.md': SKILL },
      { 'CLAUDE.md': 'AGENTS.md' },
    );
    expect(await checkHarnessParity(root)).toEqual([
      '.mcp.json must be a symlink to .pi/mcp.json (Claude Code reads .mcp.json, pi reads .pi/mcp.json)',
      '.claude/skills must be a symlink to ../.agents/skills (Claude Code reads .claude/skills, pi reads .agents/skills)',
    ]);
  });

  it('reports a skill whose frontmatter name differs from its directory or lacks a description', async () => {
    const root = await makeCompliantRepo();
    await mkdir(join(root, '.agents/skills/audit'), { recursive: true });
    await writeFile(join(root, '.agents/skills/audit/SKILL.md'), '---\nname: judge-two\n---\n');
    expect(await checkHarnessParity(root)).toEqual([
      '.agents/skills/audit/SKILL.md: frontmatter name "judge-two" must equal the directory name "audit"',
      '.agents/skills/audit/SKILL.md: frontmatter must have a non-empty description',
    ]);
  });

  it('reports instructions placed where only one harness reads them', async () => {
    const root = await makeCompliantRepo();
    await mkdir(join(root, '.claude/commands'), { recursive: true });
    await writeFile(join(root, '.pi/APPEND_SYSTEM.md'), 'extra rules');
    expect(await checkHarnessParity(root)).toEqual([
      '.claude/commands is read by only one harness; move its content to a harness-neutral location (AGENTS.md or .agents/skills)',
      '.pi/APPEND_SYSTEM.md is read by only one harness; move its content to a harness-neutral location (AGENTS.md or .agents/skills)',
    ]);
  });
});
