import type { PiRpcClient } from './client.js';
import { isObject, type RpcEvent } from './records.js';

/** What pi did with a prompt, from the `prompt` response's `data.disposition`. */
export type PromptDisposition = 'started' | 'queued' | 'handled' | (string & {});

/** Outcome of {@link runPrompt}. */
export interface PromptRunResult {
  readonly disposition: PromptDisposition;
  /**
   * Text of the last assistant message, taken from its `message_end` event,
   * which pi treats as authoritative over the streamed deltas. Empty when no
   * run started.
   */
  readonly text: string;
  /** True when the run was aborted before settling. */
  readonly aborted: boolean;
  /** Provider or runtime error carried by the last assistant message, if any. */
  readonly errorMessage: string | undefined;
}

/** Callbacks for {@link runPrompt}. */
export interface PromptRunHooks {
  /** Called with each streamed `text_delta`, in order. */
  readonly onTextDelta?: (delta: string) => void;
}

/**
 * Sends `message` as a prompt and waits until pi reports `agent_settled`, the
 * point after which pi will not continue on its own (retries, compaction, and
 * queued follow-ups included). Returns immediately when pi handled the prompt
 * without starting a run.
 *
 * @throws The errors of {@link PiRpcClient.request} when pi rejects the prompt or exits.
 */
export async function runPrompt(
  client: PiRpcClient,
  message: string,
  hooks: PromptRunHooks = {},
): Promise<PromptRunResult> {
  let text = '';
  let errorMessage: string | undefined;
  let resolveSettled: (aborted: boolean) => void = () => undefined;
  const settled = new Promise<boolean>((resolve) => {
    resolveSettled = resolve;
  });

  const unsubscribe = client.onEvent((event: RpcEvent) => {
    const delta = textDelta(event);
    if (delta !== undefined) hooks.onTextDelta?.(delta);
    const assistant = endedAssistantMessage(event);
    if (assistant !== undefined) {
      text = assistant.text;
      errorMessage = assistant.errorMessage;
    }
    if (event.type === 'agent_settled') resolveSettled(event.aborted === true);
  });

  try {
    const response = await client.request({ type: 'prompt', message });
    const disposition =
      isObject(response.data) && typeof response.data.disposition === 'string'
        ? response.data.disposition
        : 'started';
    if (disposition === 'handled')
      return { disposition, text: '', aborted: false, errorMessage: undefined };
    const aborted = await Promise.race([
      settled,
      client.exited.then((exit) =>
        Promise.reject(
          new Error(
            `pi exited during the prompt run (code ${String(exit.code)}, signal ${String(exit.signal)})`,
          ),
        ),
      ),
    ]);
    return { disposition, text, aborted, errorMessage };
  } finally {
    unsubscribe();
  }
}

function textDelta(event: RpcEvent): string | undefined {
  if (event.type !== 'message_update') return undefined;
  const update = event.assistantMessageEvent;
  if (!isObject(update) || update.type !== 'text_delta') return undefined;
  return typeof update.delta === 'string' ? update.delta : undefined;
}

function endedAssistantMessage(
  event: RpcEvent,
): { text: string; errorMessage: string | undefined } | undefined {
  if (event.type !== 'message_end') return undefined;
  const message = event.message;
  if (!isObject(message) || message.role !== 'assistant' || !Array.isArray(message.content))
    return undefined;
  const text = message.content
    .filter(
      (block): block is { type: 'text'; text: string } =>
        isObject(block) && block.type === 'text' && typeof block.text === 'string',
    )
    .map((block) => block.text)
    .join('');
  const errorMessage = typeof message.errorMessage === 'string' ? message.errorMessage : undefined;
  return { text, errorMessage };
}
