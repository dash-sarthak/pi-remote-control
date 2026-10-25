/**
 * Public surface of the bridge daemon. Phase 1 provides the pi RPC transport;
 * the WebSocket server, auth, and session registry arrive in later phases (PLAN.md).
 */
export {
  createLogger,
  isLogLevel,
  LOG_LEVELS,
  type Logger,
  type LoggerOptions,
  type LogLevel,
} from './logging/logger.js';
export {
  DEFAULT_CLOSE_GRACE_MS,
  DEFAULT_REQUEST_TIMEOUT_MS,
  PiRpcClient,
  type PiRpcClientOptions,
  type RequestOptions,
} from './pi-rpc/client.js';
export {
  describeExit,
  PiRpcCommandError,
  PiRpcExitedError,
  PiRpcStartError,
  PiRpcTimeoutError,
  type PiRpcExit,
} from './pi-rpc/errors.js';
export { encodeJsonl, JsonlDecoder, type DecodedLine } from './pi-rpc/jsonl.js';
export {
  runPrompt,
  type PromptDisposition,
  type PromptRunHooks,
  type PromptRunResult,
} from './pi-rpc/prompt-run.js';
export {
  classifyRecord,
  isRpcResponse,
  type ClassifiedRecord,
  type RpcCommand,
  type RpcEvent,
  type RpcResponse,
} from './pi-rpc/records.js';
