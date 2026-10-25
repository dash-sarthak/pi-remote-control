import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createIsolatedPiHome,
  PINNED_PI_BIN,
  SCRIPTED_MODEL,
  SCRIPTED_PROVIDER,
  type IsolatedPiHome,
} from './support/isolated-pi.js';
import {
  startScriptedModelServer,
  type ScriptedModelServer,
} from './support/scripted-model-server.js';

const BRIDGE_DIR = fileURLToPath(new URL('..', import.meta.url));

let home: IsolatedPiHome | undefined;
let model: ScriptedModelServer | undefined;

afterEach(async () => {
  await model?.close();
  await home?.dispose();
  model = undefined;
  home = undefined;
});

/**
 * Runs `pnpm rpc-spike` exactly as RUNBOOK.md documents it, with pi isolated
 * from the developer's machine. Asynchronous because the scripted model
 * server lives in this process and must keep answering while the CLI runs.
 */
async function runSpike(args: readonly string[], extraEnv: NodeJS.ProcessEnv = {}) {
  home ??= await createIsolatedPiHome(model?.baseUrl);
  const pi = home;
  const result = await new Promise<{ status: number | null; stdout: string; stderr: string }>(
    (resolve) => {
      execFile(
        'pnpm',
        ['--silent', 'rpc-spike', '--cwd', pi.workspaceDir, ...args],
        {
          cwd: BRIDGE_DIR,
          env: { ...pi.env, PIRC_PI_COMMAND: PINNED_PI_BIN, ...extraEnv },
          timeout: 60_000,
        },
        (error, stdout, stderr) => {
          const status = error === null ? 0 : typeof error.code === 'number' ? error.code : null;
          resolve({ status, stdout, stderr });
        },
      );
    },
  );
  const logs = result.stderr
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  return { exitCode: result.status, stdout: result.stdout, logs };
}

describe('rpc-spike: prompt pi from the command line', () => {
  it('prints the streamed reply to stdout and exits 0', async () => {
    model = await startScriptedModelServer(['Hello', ' from ', 'pi']);
    const run = await runSpike([
      '--provider',
      SCRIPTED_PROVIDER,
      '--model',
      SCRIPTED_MODEL,
      'Say hello',
    ]);
    expect(run.stdout).toBe('Hello from pi\n');
    expect(run.exitCode).toBe(0);
  });

  it('writes only structured JSON logs to stderr, each with time, level, component, and message', async () => {
    model = await startScriptedModelServer(['ok']);
    const run = await runSpike(['--provider', SCRIPTED_PROVIDER, '--model', SCRIPTED_MODEL, 'Hi']);
    expect(run.logs.length).toBeGreaterThan(0);
    for (const line of run.logs) {
      expect(line).toMatchObject({
        time: expect.any(String) as unknown,
        level: expect.stringMatching(/^(trace|debug|info|warn|error|fatal)$/) as unknown,
        component: expect.any(String) as unknown,
        msg: expect.any(String) as unknown,
      });
    }
    expect(run.logs).toContainEqual(
      expect.objectContaining({ msg: 'prompt settled', aborted: false }),
    );
  });

  it('fails with exit code 1 and pi’s reason when no model is configured', async () => {
    const run = await runSpike(['Say hello']);
    expect(run.stdout).toBe('');
    expect(run.exitCode).toBe(1);
    expect(run.logs).toContainEqual(
      expect.objectContaining({
        level: 'error',
        msg: 'rpc-spike failed',
        err: expect.objectContaining({
          message: expect.stringContaining('No API key') as unknown,
        }) as unknown,
      }),
    );
  });

  it('fails with exit code 2 and a usage message when no prompt is given', async () => {
    const run = await runSpike([]);
    expect(run.exitCode).toBe(2);
    expect(run.logs).toContainEqual(
      expect.objectContaining({ level: 'error', msg: expect.stringContaining('usage') as unknown }),
    );
  });

  it('fails with exit code 1 naming the command when pi cannot be started', async () => {
    const run = await runSpike(['Say hello'], { PIRC_PI_COMMAND: '/nonexistent/pi' });
    expect(run.exitCode).toBe(1);
    expect(run.logs).toContainEqual(
      expect.objectContaining({
        msg: 'rpc-spike failed',
        err: expect.objectContaining({
          message: expect.stringContaining('/nonexistent/pi') as unknown,
        }) as unknown,
      }),
    );
  });
});
