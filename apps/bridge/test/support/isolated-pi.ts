import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Absolute path of the pi CLI pinned in this workspace's devDependencies. */
export const PINNED_PI_BIN = fileURLToPath(new URL('../../node_modules/.bin/pi', import.meta.url));

/**
 * CLI flags that stop pi from loading anything from the developer's machine:
 * no extensions, skills, prompt templates, themes, context files, MCP servers,
 * saved sessions, or startup network calls.
 */
export const ISOLATION_FLAGS: readonly string[] = [
  '--no-session',
  '--no-extensions',
  '--no-skills',
  '--no-prompt-templates',
  '--no-themes',
  '--no-context-files',
  '--no-mcp',
  '--offline',
];

/** Provider and model names registered in the isolated agent directory. */
export const SCRIPTED_PROVIDER = 'scripted';
export const SCRIPTED_MODEL = 'scripted-model';

/** A throwaway pi agent directory and project directory, plus the environment that selects them. */
export interface IsolatedPiHome {
  /** Empty project directory to run pi in, so no repository AGENTS.md or `.pi/` config is discovered. */
  readonly workspaceDir: string;
  /** Environment for the pi child: `PI_CODING_AGENT_DIR` points at the temp dir. */
  readonly env: NodeJS.ProcessEnv;
  /** Deletes the temporary agent directory. */
  readonly dispose: () => Promise<void>;
}

/**
 * Creates an empty pi agent directory and an empty workspace directory. When `modelBaseUrl` is given, the
 * directory's `models.json` registers {@link SCRIPTED_PROVIDER}/{@link SCRIPTED_MODEL}
 * against that OpenAI-compatible URL.
 */
export async function createIsolatedPiHome(modelBaseUrl?: string): Promise<IsolatedPiHome> {
  const agentDir = await mkdtemp(join(tmpdir(), 'pirc-pi-home-'));
  const workspaceDir = await mkdtemp(join(tmpdir(), 'pirc-pi-workspace-'));
  if (modelBaseUrl !== undefined) {
    const models = {
      providers: {
        [SCRIPTED_PROVIDER]: {
          baseUrl: modelBaseUrl,
          api: 'openai-completions',
          apiKey: 'scripted-key',
          models: [{ id: SCRIPTED_MODEL }],
        },
      },
    };
    await writeFile(join(agentDir, 'models.json'), JSON.stringify(models));
  }
  return {
    workspaceDir,
    env: { ...process.env, PI_CODING_AGENT_DIR: agentDir, PI_OFFLINE: '1' },
    dispose: async () => {
      await rm(agentDir, { recursive: true, force: true });
      await rm(workspaceDir, { recursive: true, force: true });
    },
  };
}
