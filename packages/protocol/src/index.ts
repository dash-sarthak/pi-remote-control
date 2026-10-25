/**
 * Phone ⇄ bridge WebSocket envelope. Every message in both directions uses
 * this shape; the payload discriminator is `type`. Mirrors the pi RPC
 * command/event families the bridge forwards (see PLAN.md).
 */

/**
 * Every envelope type, with its direction:
 * `command` phone → bridge (a pi RPC command), `response` bridge → phone
 * (that command's result), `event` bridge → phone (a session event),
 * `approval` bridge → phone (a pending extension-UI approval), and
 * `approval_response` phone → bridge (the verdict).
 */
export const ENVELOPE_TYPES = [
  'command',
  'response',
  'event',
  'approval',
  'approval_response',
] as const;

/** One of {@link ENVELOPE_TYPES}. */
export type EnvelopeType = (typeof ENVELOPE_TYPES)[number];

/** A message on the phone ⇄ bridge socket. */
export interface Envelope {
  type: EnvelopeType;
  /** pi session this message belongs to; multiplexes sessions over one socket. */
  sessionId: string;
  /** Echoed by the matching `response`. */
  correlationId?: string;
  payload: unknown;
}

/**
 * Returns true when `value` is a well-formed {@link Envelope}. Use on every
 * message read from the socket before acting on it.
 *
 * @param value - Untrusted output of `JSON.parse`.
 */
export function isEnvelope(value: unknown): value is Envelope {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return (
    (ENVELOPE_TYPES as readonly unknown[]).includes(v.type) &&
    typeof v.sessionId === 'string' &&
    v.sessionId.length > 0 &&
    (v.correlationId === undefined || typeof v.correlationId === 'string') &&
    'payload' in v
  );
}
