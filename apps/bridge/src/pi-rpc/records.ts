/**
 * Shapes of the records exchanged with `pi --mode rpc`, and type guards that
 * validate untrusted stdout records before the bridge acts on them.
 *
 * These describe the bridge ⇄ pi boundary only. Phone ⇄ bridge envelopes live
 * in `@pirc/protocol`. Canonical definitions: pi's `docs/rpc-commands.md` and
 * `docs/json.md`.
 */

/** A command written to pi's stdin. The client assigns `id`; callers supply the rest. */
export interface RpcCommand {
  /** Command name, for example `prompt` or `get_state`. */
  readonly type: string;
  readonly [field: string]: unknown;
}

/** pi's reply to one command. `id` echoes the command's id when one was sent. */
export interface RpcResponse {
  readonly type: 'response';
  readonly id?: string;
  /** Name of the command being answered, or `parse` when the input line was not JSON. */
  readonly command: string;
  readonly success: boolean;
  readonly data?: unknown;
  /** Human-readable reason, present when `success` is false. */
  readonly error?: string;
}

/** Any non-response record on pi's stdout: session events and extension UI requests. */
export interface RpcEvent {
  readonly type: string;
  readonly [field: string]: unknown;
}

/** Result of validating one decoded stdout record. */
export type ClassifiedRecord =
  | { readonly kind: 'response'; readonly response: RpcResponse }
  | { readonly kind: 'event'; readonly event: RpcEvent }
  | { readonly kind: 'invalid'; readonly reason: string };

/**
 * Validates a decoded stdout value and sorts it into a response or an event.
 *
 * @param value - Untrusted output of `JSON.parse`.
 */
export function classifyRecord(value: unknown): ClassifiedRecord {
  if (!isObject(value)) return { kind: 'invalid', reason: 'record is not a JSON object' };
  const type = value.type;
  if (typeof type !== 'string' || type.length === 0) {
    return { kind: 'invalid', reason: 'record has no string "type" field' };
  }
  if (type !== 'response') return { kind: 'event', event: value as RpcEvent };
  if (isRpcResponse(value)) return { kind: 'response', response: value };
  return {
    kind: 'invalid',
    reason:
      'response record is missing "command" or "success", or has a non-string "id" or "error"',
  };
}

/** Returns true when `value` has the shape of {@link RpcResponse}. */
export function isRpcResponse(value: unknown): value is RpcResponse {
  return (
    isObject(value) &&
    value.type === 'response' &&
    typeof value.command === 'string' &&
    typeof value.success === 'boolean' &&
    (value.id === undefined || typeof value.id === 'string') &&
    (value.error === undefined || typeof value.error === 'string')
  );
}

/** Returns true when `value` is a non-null, non-array object. */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
