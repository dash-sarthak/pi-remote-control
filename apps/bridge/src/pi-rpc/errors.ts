import type { RpcResponse } from './records.js';

/** How a pi child process ended: exactly one of `code` and `signal` is non-null. */
export interface PiRpcExit {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
}

/** The pi executable could not be spawned, for example because it does not exist. */
export class PiRpcStartError extends Error {
  override readonly name = 'PiRpcStartError';

  /**
   * @param command - The executable the bridge tried to run.
   * @param cause - The spawn error reported by Node.
   */
  constructor(
    readonly command: string,
    cause: Error,
  ) {
    super(`failed to start pi (${command}): ${cause.message}`, { cause });
  }
}

/** pi answered a command with `success: false`. */
export class PiRpcCommandError extends Error {
  override readonly name = 'PiRpcCommandError';

  /** @param response - pi's failure response, kept for callers that need its fields. */
  constructor(readonly response: RpcResponse) {
    super(`pi rejected "${response.command}": ${response.error ?? 'no error message given'}`);
  }
}

/** pi did not answer a command within the request timeout. */
export class PiRpcTimeoutError extends Error {
  override readonly name = 'PiRpcTimeoutError';

  /**
   * @param commandType - The command that went unanswered.
   * @param timeoutMs - How long the client waited.
   */
  constructor(
    readonly commandType: string,
    readonly timeoutMs: number,
  ) {
    super(`pi did not answer "${commandType}" within ${timeoutMs} ms`);
  }
}

/** The pi process exited before answering, or a command was sent after it exited. */
export class PiRpcExitedError extends Error {
  override readonly name = 'PiRpcExitedError';

  /**
   * @param commandType - The command that could not be answered.
   * @param exit - How the process ended.
   */
  constructor(
    readonly commandType: string,
    readonly exit: PiRpcExit,
  ) {
    super(`pi ${describeExit(exit)} before answering "${commandType}"`);
  }
}

/** Formats an exit as `exited with code N` or `was killed by SIGNAL`. */
export function describeExit(exit: PiRpcExit): string {
  return exit.signal === null
    ? `exited with code ${String(exit.code)}`
    : `was killed by ${exit.signal}`;
}
