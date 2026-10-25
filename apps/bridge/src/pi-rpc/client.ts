import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { once } from 'node:events';
import type { Logger } from '../logging/logger.js';
import {
  PiRpcCommandError,
  PiRpcExitedError,
  PiRpcStartError,
  PiRpcTimeoutError,
  type PiRpcExit,
} from './errors.js';
import { encodeJsonl, JsonlDecoder, type DecodedLine } from './jsonl.js';
import { classifyRecord, type RpcCommand, type RpcEvent, type RpcResponse } from './records.js';

export { PiRpcCommandError, PiRpcExitedError, PiRpcStartError, PiRpcTimeoutError, type PiRpcExit };

/** Default time to wait for pi to answer one command. */
export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

/** Default time {@link PiRpcClient.close} waits after closing stdin before sending SIGTERM. */
export const DEFAULT_CLOSE_GRACE_MS = 5_000;

/** Options for {@link PiRpcClient.start}. */
export interface PiRpcClientOptions {
  /** Executable to run, normally `pi`. */
  readonly command: string;
  /** Arguments, normally starting with `--mode rpc`. */
  readonly args: readonly string[];
  /** Working directory pi operates in. Defaults to the bridge's own. */
  readonly cwd?: string;
  /** Environment for the child. Defaults to the bridge's own. */
  readonly env?: NodeJS.ProcessEnv;
  readonly logger: Logger;
  /** Per-command deadline. Defaults to {@link DEFAULT_REQUEST_TIMEOUT_MS}. */
  readonly requestTimeoutMs?: number;
  /** Shutdown grace period. Defaults to {@link DEFAULT_CLOSE_GRACE_MS}. */
  readonly closeGraceMs?: number;
}

/** Per-call overrides for {@link PiRpcClient.request}. */
export interface RequestOptions {
  readonly timeoutMs?: number;
}

interface PendingRequest {
  readonly commandType: string;
  readonly resolve: (response: RpcResponse) => void;
  readonly reject: (error: Error) => void;
  readonly timer: NodeJS.Timeout;
}

/**
 * One running `pi --mode rpc` child process.
 *
 * Commands are correlated with their responses by a client-assigned `id`, so
 * any number may be in flight and pi may answer them in any order. Every
 * other stdout record is delivered to {@link onEvent} listeners in stream
 * order. Malformed stdout and all stderr output are logged, never parsed as
 * protocol data.
 */
export class PiRpcClient {
  /** Resolves once with how the process ended. Never rejects. */
  readonly exited: Promise<PiRpcExit>;

  private readonly pending = new Map<string, PendingRequest>();
  private readonly listeners = new Set<(event: RpcEvent) => void>();
  private readonly decoder = new JsonlDecoder();
  private nextId = 1;
  private exit: PiRpcExit | undefined;

  private constructor(
    private readonly child: ChildProcessWithoutNullStreams,
    private readonly logger: Logger,
    private readonly requestTimeoutMs: number,
    private readonly closeGraceMs: number,
  ) {
    child.stdout.on('data', (chunk: Buffer) => {
      this.handleLines(this.decoder.push(chunk));
    });
    child.stdout.on('end', () => {
      this.handleLines(this.decoder.end());
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (text: string) => {
      for (const line of text.split('\n')) {
        if (line.trim().length > 0) this.logger.info({ stderr: line }, 'pi stderr');
      }
    });
    child.stdin.on('error', (error) => {
      this.logger.warn({ err: error }, 'pi stdin closed with an error');
    });
    this.exited = new Promise((resolve) => {
      child.once('exit', (code, signal) => {
        const exit = { code, signal };
        this.exit = exit;
        this.logger[code === 0 ? 'info' : 'warn']({ code, signal }, 'pi process exited');
        for (const [id, request] of this.pending) {
          clearTimeout(request.timer);
          this.pending.delete(id);
          request.reject(new PiRpcExitedError(request.commandType, exit));
        }
        resolve(exit);
      });
    });
  }

  /**
   * Spawns pi and resolves once the process is running.
   *
   * @throws {PiRpcStartError} When the executable cannot be spawned.
   */
  static async start(options: PiRpcClientOptions): Promise<PiRpcClient> {
    const logger = options.logger.child({ piCommand: options.command });
    const child = spawn(options.command, options.args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    try {
      await Promise.race([
        once(child, 'spawn'),
        once(child, 'error').then(([error]) => Promise.reject(error as Error)),
      ]);
    } catch (error) {
      throw new PiRpcStartError(options.command, error as Error);
    }
    logger.info({ pid: child.pid, args: options.args, cwd: options.cwd }, 'pi process started');
    return new PiRpcClient(
      child,
      logger,
      options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
      options.closeGraceMs ?? DEFAULT_CLOSE_GRACE_MS,
    );
  }

  /** Operating-system process id of the pi child. */
  get pid(): number {
    if (this.child.pid === undefined) throw new Error('pi child has no pid although it spawned');
    return this.child.pid;
  }

  /**
   * Sends one command and resolves with pi's successful response.
   *
   * @throws {PiRpcCommandError} When pi answers with `success: false`.
   * @throws {PiRpcTimeoutError} When pi does not answer in time.
   * @throws {PiRpcExitedError} When pi has exited or exits before answering.
   */
  async request(command: RpcCommand, options: RequestOptions = {}): Promise<RpcResponse> {
    if (this.exit !== undefined) throw new PiRpcExitedError(command.type, this.exit);
    const id = `req-${this.nextId++}`;
    const timeoutMs = options.timeoutMs ?? this.requestTimeoutMs;
    const response = new Promise<RpcResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new PiRpcTimeoutError(command.type, timeoutMs));
      }, timeoutMs);
      this.pending.set(id, { commandType: command.type, resolve, reject, timer });
    });
    this.logger.debug({ id, command: command.type }, 'sending pi command');
    if (!this.child.stdin.write(encodeJsonl({ ...command, id }))) {
      await once(this.child.stdin, 'drain');
    }
    const result = await response;
    if (!result.success) throw new PiRpcCommandError(result);
    return result;
  }

  /**
   * Registers `listener` for every non-response record, in stream order.
   * Register before sending a prompt so fast runs are not missed.
   *
   * @returns A function that removes the listener.
   */
  onEvent(listener: (event: RpcEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Requests an orderly shutdown by closing pi's stdin, as pi's RPC docs
   * specify, and sends SIGTERM if pi has not exited within the close grace period.
   * Safe to call more than once.
   */
  async close(): Promise<PiRpcExit> {
    if (this.exit !== undefined) return this.exit;
    this.child.stdin.end();
    const timer = setTimeout(() => {
      this.logger.warn(
        { graceMs: this.closeGraceMs },
        'pi did not exit after stdin closed; sending SIGTERM',
      );
      this.child.kill('SIGTERM');
    }, this.closeGraceMs);
    const exit = await this.exited;
    clearTimeout(timer);
    return exit;
  }

  private handleLines(lines: readonly DecodedLine[]): void {
    for (const line of lines) {
      if (line.kind === 'malformed') {
        this.logger.error(
          { line: line.line, reason: line.reason },
          'pi wrote a malformed RPC record',
        );
        continue;
      }
      const record = classifyRecord(line.value);
      if (record.kind === 'invalid') {
        this.logger.error(
          { record: line.value, reason: record.reason },
          'pi wrote an invalid RPC record',
        );
      } else if (record.kind === 'response') {
        this.settle(record.response);
      } else {
        this.dispatch(record.event);
      }
    }
  }

  private settle(response: RpcResponse): void {
    const id = response.id;
    const request = id === undefined ? undefined : this.pending.get(id);
    if (id === undefined || request === undefined) {
      this.logger.error({ response }, 'pi answered a command the bridge is not waiting for');
      return;
    }
    clearTimeout(request.timer);
    this.pending.delete(id);
    this.logger.debug(
      { id: response.id, command: response.command, success: response.success },
      'pi answered',
    );
    request.resolve(response);
  }

  private dispatch(event: RpcEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        this.logger.error({ err: error, eventType: event.type }, 'pi event listener threw');
        throw error;
      }
    }
  }
}
