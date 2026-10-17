/**
 * Phone ⇄ bridge WebSocket envelope. Every message in both directions uses
 * this shape; the payload discriminator is `type`. Mirrors the pi RPC
 * command/event families we forward (see PLAN.md).
 */

export type EnvelopeType =
  | 'command' // phone → bridge: pi RPC command
  | 'response' // bridge → phone: command result
  | 'event' // bridge → phone: session event stream record
  | 'approval' // bridge → phone: pending extension-UI approval
  | 'approval_response'; // phone → bridge: approval verdict

export interface Envelope {
  type: EnvelopeType;
  /** pi session this message belongs to; multiplexes sessions over one socket. */
  sessionId: string;
  /** Echoed by the matching `response`. */
  correlationId?: string;
  payload: unknown;
}

export function isEnvelope(value: unknown): value is Envelope {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v['type'] === 'string' &&
    typeof v['sessionId'] === 'string' &&
    v['sessionId'].length > 0 &&
    'payload' in v
  );
}
