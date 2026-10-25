/**
 * Harness parity: Claude Code and pi must load the same instructions, skills,
 * and MCP servers from this repository, so both behave the same here.
 *
 * | Concern      | Canonical location (pi)  | Claude Code reads       | Required link               |
 * | ------------ | ------------------------ | ----------------------- | --------------------------- |
 * | Instructions | `AGENTS.md` (any folder) | `CLAUDE.md`             | `CLAUDE.md → AGENTS.md`     |
 * | Skills       | `.agents/skills/<name>/` | `.claude/skills/`       | `.claude/skills → ../.agents/skills` |
 * | MCP servers  | `.pi/mcp.json`           | `.mcp.json`             | `.mcp.json → .pi/mcp.json`  |
 */
import { lstat, readdir, readFile, readlink } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';

/** Directories never searched for AGENTS.md files. */
const SKIPPED_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  '.turbo',
  '.expo',
  'dist',
  'coverage',
  'audit',
]);

/** Paths that only one harness reads; instructions there would make the harnesses diverge. */
const SINGLE_HARNESS_PATHS = [
  '.claude/commands',
  '.claude/agents',
  '.claude/hooks',
  '.claude/output-styles',
  '.pi/skills',
  '.pi/prompts',
  '.pi/extensions',
  '.pi/SYSTEM.md',
  '.pi/APPEND_SYSTEM.md',
  'AGENTS.override.md',
];

/**
 * Checks `repoRoot` for harness-parity violations.
 *
 * @param {string} repoRoot - Absolute path of the repository to check.
 * @returns {Promise<string[]>} One human-readable problem per violation, in a stable order; empty when compliant.
 */
export async function checkHarnessParity(repoRoot) {
  const problems = [];
  for (const agentsFile of await findAgentsFiles(repoRoot, repoRoot)) {
    const claudeFile = join(dirname(agentsFile), 'CLAUDE.md');
    if ((await symlinkTarget(join(repoRoot, claudeFile))) !== 'AGENTS.md') {
      problems.push(
        `${claudeFile} must be a symlink to AGENTS.md (Claude Code reads CLAUDE.md, pi reads AGENTS.md)`,
      );
    }
  }
  if ((await symlinkTarget(join(repoRoot, '.mcp.json'))) !== '.pi/mcp.json') {
    problems.push(
      '.mcp.json must be a symlink to .pi/mcp.json (Claude Code reads .mcp.json, pi reads .pi/mcp.json)',
    );
  }
  if ((await symlinkTarget(join(repoRoot, '.claude/skills'))) !== '../.agents/skills') {
    problems.push(
      '.claude/skills must be a symlink to ../.agents/skills (Claude Code reads .claude/skills, pi reads .agents/skills)',
    );
  }
  problems.push(...(await checkSkills(repoRoot)));
  for (const path of SINGLE_HARNESS_PATHS) {
    if (await exists(join(repoRoot, path))) {
      problems.push(
        `${path} is read by only one harness; move its content to a harness-neutral location (AGENTS.md or .agents/skills)`,
      );
    }
  }
  return problems;
}

/**
 * Validates every `.agents/skills/<dir>/SKILL.md` against the Agent Skills rules both harnesses rely on.
 *
 * @param {string} repoRoot
 * @returns {Promise<string[]>}
 */
async function checkSkills(repoRoot) {
  const skillsDir = join(repoRoot, '.agents/skills');
  if (!(await exists(skillsDir))) return [];
  const problems = [];
  const entries = (await readdir(skillsDir, { withFileTypes: true })).filter((entry) =>
    entry.isDirectory(),
  );
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const skillFile = `.agents/skills/${entry.name}/SKILL.md`;
    if (!(await exists(join(repoRoot, skillFile)))) {
      problems.push(`${skillFile} is missing`);
      continue;
    }
    const frontmatter = parseFrontmatter(await readFile(join(repoRoot, skillFile), 'utf8'));
    if (frontmatter['name'] !== entry.name) {
      problems.push(
        `${skillFile}: frontmatter name "${frontmatter['name'] ?? ''}" must equal the directory name "${entry.name}"`,
      );
    }
    if ((frontmatter['description'] ?? '').length === 0) {
      problems.push(`${skillFile}: frontmatter must have a non-empty description`);
    }
  }
  return problems;
}

/**
 * Reads the top-level `key: value` pairs of a Markdown file's YAML frontmatter.
 * Folded values (`key: >`) are joined from their indented continuation lines.
 *
 * @param {string} markdown
 * @returns {Record<string, string>}
 */
function parseFrontmatter(markdown) {
  const match = /^---\n([\s\S]*?)\n---/.exec(markdown);
  if (match?.[1] === undefined) return {};
  /** @type {Record<string, string>} */
  const fields = {};
  let currentKey;
  for (const line of match[1].split('\n')) {
    const pair = /^([a-z][\w-]*):\s*(.*)$/.exec(line);
    if (pair?.[1] !== undefined) {
      currentKey = pair[1];
      fields[currentKey] = (pair[2] ?? '').replace(/^[>|]-?$/, '').trim();
    } else if (currentKey !== undefined && /^\s+\S/.test(line)) {
      fields[currentKey] = `${fields[currentKey] ?? ''} ${line.trim()}`.trim();
    }
  }
  return fields;
}

/**
 * Lists AGENTS.md files under `dir`, as paths relative to `repoRoot`, sorted.
 *
 * @param {string} repoRoot
 * @param {string} dir
 * @returns {Promise<string[]>}
 */
async function findAgentsFiles(repoRoot, dir) {
  const found = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isDirectory() && !SKIPPED_DIRECTORIES.has(entry.name)) {
      found.push(...(await findAgentsFiles(repoRoot, join(dir, entry.name))));
    } else if (entry.isFile() && entry.name === 'AGENTS.md') {
      found.push(relative(repoRoot, join(dir, entry.name)));
    }
  }
  return found.sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b));
}

/**
 * Returns the raw target of the symlink at `path`, or `undefined` when `path` is missing or not a symlink.
 *
 * @param {string} path
 * @returns {Promise<string | undefined>}
 */
async function symlinkTarget(path) {
  try {
    if (!(await lstat(path)).isSymbolicLink()) return undefined;
    return await readlink(path);
  } catch (error) {
    if (isMissing(error)) return undefined;
    throw error;
  }
}

/**
 * @param {string} path
 * @returns {Promise<boolean>} Whether anything, including a dangling symlink, exists at `path`.
 */
async function exists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
}

/**
 * @param {unknown} error
 * @returns {boolean} Whether `error` is Node's "no such file or directory".
 */
function isMissing(error) {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
