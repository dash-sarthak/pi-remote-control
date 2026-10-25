import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * A local stand-in for an OpenAI-compatible chat-completions endpoint.
 *
 * Every request receives the same scripted streaming reply, so a real `pi`
 * process pointed at this server produces byte-for-byte reproducible output
 * without network access, credentials, or model cost.
 */
export interface ScriptedModelServer {
  /** Base URL to put in pi's `models.json` (ends in `/v1`). */
  readonly baseUrl: string;
  /** Number of chat-completion requests received so far. */
  readonly requestCount: () => number;
  /** Stops listening and waits for open connections to close. */
  readonly close: () => Promise<void>;
}

/**
 * Starts a scripted model server on an ephemeral localhost port.
 *
 * @param replyChunks - Text fragments streamed, in order, as `delta.content`.
 */
export async function startScriptedModelServer(
  replyChunks: readonly string[],
): Promise<ScriptedModelServer> {
  let requests = 0;
  const server: Server = createServer((request, response) => {
    if (request.method !== 'POST' || !request.url?.endsWith('/chat/completions')) {
      response.writeHead(404).end();
      return;
    }
    requests += 1;
    request.resume();
    request.on('end', () => {
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      const chunk = (delta: Record<string, unknown>, finishReason: string | null): string =>
        `data: ${JSON.stringify({
          id: 'scripted',
          object: 'chat.completion.chunk',
          created: 0,
          model: 'scripted',
          choices: [{ index: 0, delta, finish_reason: finishReason }],
        })}\n\n`;
      response.write(chunk({ role: 'assistant', content: '' }, null));
      for (const text of replyChunks) {
        response.write(chunk({ content: text }, null));
      }
      response.write(chunk({}, 'stop'));
      response.end('data: [DONE]\n\n');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}/v1`,
    requestCount: () => requests,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      }),
  };
}
