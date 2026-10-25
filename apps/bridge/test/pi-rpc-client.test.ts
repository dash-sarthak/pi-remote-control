import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLogger, type Logger } from '../src/logging/logger.js';
import {
  PiRpcClient,
  PiRpcCommandError,
  PiRpcExitedError,
  PiRpcStartError,
  PiRpcTimeoutError,
} from '../src/pi-rpc/client.js';
import type { RpcEvent } from '../src/pi-rpc/records.js';
import { runPrompt } from '../src/pi-rpc/prompt-run.js';
import {
  createIsolatedPiHome,
  ISOLATION_FLAGS,
  PINNED_PI_BIN,
  SCRIPTED_MODEL,
  SCRIPTED_PROVIDER,
  type IsolatedPiHome,
} from './support/isolated-pi.js';
import {
  startScriptedModelServer,
  type ScriptedModelServer,
} from './support/scripted-model-server.js';

/** Log lines written by the client under test, parsed from JSON. */
let logLines: Record<string, unknown>[];
let logger: Logger;
let home: IsolatedPiHome | undefined;
let model: ScriptedModelServer | undefined;
let client: PiRpcClient | undefined;

beforeEach(() => {
  logLines = [];
  logger = createLogger({
    component: 'test',
    level: 'debug',
    write: (line) => logLines.push(JSON.parse(line) as Record<string, unknown>),
  });
});

afterEach(async () => {
  await client?.close();
  await model?.close();
  await home?.dispose();
  client = undefined;
  model = undefined;
  home = undefined;
});

/** Starts the pinned pi CLI in RPC mode with no access to the developer's pi configuration. */
async function startRealPi(replyChunks?: readonly string[]): Promise<PiRpcClient> {
  const modelArgs: string[] = [];
  if (replyChunks !== undefined) {
    model = await startScriptedModelServer(replyChunks);
    modelArgs.push('--provider', SCRIPTED_PROVIDER, '--model', SCRIPTED_MODEL);
  }
  home = await createIsolatedPiHome(model?.baseUrl);
  client = await PiRpcClient.start({
    command: PINNED_PI_BIN,
    args: ['--mode', 'rpc', ...ISOLATION_FLAGS, ...modelArgs],
    cwd: home.workspaceDir,
    env: home.env,
    logger,
  });
  return client;
}

/** Starts a Node child that runs `script`, standing in for a misbehaving pi. */
async function startFakePi(script: string, requestTimeoutMs?: number): Promise<PiRpcClient> {
  client = await PiRpcClient.start({
    command: process.execPath,
    args: ['-e', script],
    logger,
    closeGraceMs: 100,
    ...(requestTimeoutMs === undefined ? {} : { requestTimeoutMs }),
  });
  return client;
}

describe('Given a real pi process in RPC mode', () => {
  it('when the bridge asks for state, then it receives the session state', async () => {
    const pi = await startRealPi();
    const response = await pi.request({ type: 'get_state' });
    expect(response).toMatchObject({
      type: 'response',
      command: 'get_state',
      success: true,
      data: { isStreaming: false, messageCount: 0, sessionId: expect.any(String) as unknown },
    });
  });

  it('when several commands are in flight, then each caller receives its own response', async () => {
    const pi = await startRealPi();
    const [state, commands, stats] = await Promise.all([
      pi.request({ type: 'get_state' }),
      pi.request({ type: 'get_commands' }),
      pi.request({ type: 'get_session_stats' }),
    ]);
    expect([state.command, commands.command, stats.command]).toEqual([
      'get_state',
      'get_commands',
      'get_session_stats',
    ]);
  });

  it('when pi rejects a command, then the request fails with pi’s error message', async () => {
    const pi = await startRealPi();
    const failure = pi.request({ type: 'no_such_command' });
    await expect(failure).rejects.toBeInstanceOf(PiRpcCommandError);
    await expect(failure).rejects.toThrow('Unknown command: no_such_command');
  });

  it('when a prompt runs, then text deltas stream in order and the settled text is the assistant’s full reply', async () => {
    const pi = await startRealPi(['Hello', ', ', 'phone\u2028!']);
    const deltas: string[] = [];
    const result = await runPrompt(pi, 'Say hello', { onTextDelta: (delta) => deltas.push(delta) });
    expect(deltas).toEqual(['Hello', ', ', 'phone\u2028!']);
    expect(result).toEqual({
      disposition: 'started',
      text: 'Hello, phone\u2028!',
      aborted: false,
      errorMessage: undefined,
    });
    expect(model?.requestCount()).toBe(1);
  });

  it('when a prompt runs, then subscribed listeners see the run lifecycle events in order', async () => {
    const pi = await startRealPi(['ok']);
    const lifecycle: string[] = [];
    const unsubscribe = pi.onEvent((event: RpcEvent) => {
      if (['agent_start', 'agent_end', 'agent_settled'].includes(event.type))
        lifecycle.push(event.type);
    });
    await runPrompt(pi, 'go');
    unsubscribe();
    expect(lifecycle).toEqual(['agent_start', 'agent_end', 'agent_settled']);
  });

  it('when the bridge closes the client, then pi exits cleanly with code 0', async () => {
    const pi = await startRealPi();
    await pi.request({ type: 'get_state' });
    await expect(pi.close()).resolves.toEqual({ code: 0, signal: null });
  });

  it('when pi is killed, then later requests fail with an exit error naming the signal', async () => {
    const pi = await startRealPi();
    process.kill(pi.pid, 'SIGKILL');
    await expect(pi.exited).resolves.toEqual({ code: null, signal: 'SIGKILL' });
    await expect(pi.request({ type: 'get_state' })).rejects.toThrow(PiRpcExitedError);
    expect(logLines).toContainEqual(
      expect.objectContaining({ level: 'warn', msg: 'pi process exited', signal: 'SIGKILL' }),
    );
  });
});

describe('Given a pi executable that cannot be started', () => {
  it('when the bridge starts it, then start fails with an error naming the command', async () => {
    const start = PiRpcClient.start({ command: '/nonexistent/pi', args: [], logger });
    await expect(start).rejects.toBeInstanceOf(PiRpcStartError);
    await expect(start).rejects.toThrow('/nonexistent/pi');
  });
});

describe('Given a pi process that misbehaves', () => {
  it('when it never answers, then the request times out instead of hanging', async () => {
    const pi = await startFakePi('setInterval(() => {}, 1000)', 200);
    const failure = pi.request({ type: 'get_state' });
    await expect(failure).rejects.toBeInstanceOf(PiRpcTimeoutError);
    await expect(failure).rejects.toThrow('get_state');
  });

  it('when it exits with a request in flight, then that request fails with the exit code', async () => {
    const pi = await startFakePi("process.stdin.once('data', () => process.exit(3))");
    await expect(pi.request({ type: 'get_state' })).rejects.toThrow('exited with code 3');
  });

  it('when it writes a non-JSON line, then the bridge logs a protocol error and keeps serving', async () => {
    const script = [
      "process.stdout.write('garbage\\n');",
      "process.stdin.on('data', (chunk) => {",
      '  const { id } = JSON.parse(String(chunk));',
      "  process.stdout.write(JSON.stringify({ id, type: 'response', command: 'get_state', success: true, data: {} }) + '\\r\\n');",
      '});',
    ].join('\n');
    const pi = await startFakePi(script);
    await expect(pi.request({ type: 'get_state' })).resolves.toMatchObject({ success: true });
    expect(logLines).toContainEqual(
      expect.objectContaining({
        level: 'error',
        msg: 'pi wrote a malformed RPC record',
        line: 'garbage',
      }),
    );
  });

  it('when it writes diagnostics to stderr, then they are logged and never parsed as protocol', async () => {
    const pi = await startFakePi(
      "console.error('diagnostic from pi'); setInterval(() => {}, 1000)",
    );
    await expect.poll(() => logLines.map((line) => line.stderr)).toContain('diagnostic from pi');
    await pi.close();
  });
});
