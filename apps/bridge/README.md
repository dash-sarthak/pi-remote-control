# @pirc/bridge

The laptop-side daemon. It runs `pi --mode rpc` child processes and, in later phases, exposes them to the phone over an authenticated WebSocket (see [PLAN.md](../../PLAN.md)).

Phase 1 delivers the **pi RPC transport**: everything needed to start pi, send it commands, and consume its event stream reliably. The command-line proof is `rpc-spike` ([RUNBOOK.md](../../RUNBOOK.md#prompt-pi-from-the-command-line-rpc-spike)).

## Modules

| Module                     | Responsibility                                                                                  |
| -------------------------- | ----------------------------------------------------------------------------------------------- |
| `src/logging/logger.ts`    | `createLogger`: structured JSON-lines logger (pino) on stderr                                   |
| `src/pi-rpc/jsonl.ts`      | `JsonlDecoder` / `encodeJsonl`: byte-level JSONL framing                                        |
| `src/pi-rpc/records.ts`    | Record shapes and type guards for pi's stdout (`classifyRecord`)                                |
| `src/pi-rpc/errors.ts`     | Typed failures: start, command rejected, timeout, process exited                                |
| `src/pi-rpc/client.ts`     | `PiRpcClient`: one pi child; id-correlated requests; ordered event delivery; shutdown           |
| `src/pi-rpc/prompt-run.ts` | `runPrompt`: send a prompt, stream text deltas, wait for `agent_settled`, return the final text |
| `src/cli/rpc-spike.ts`     | `rpc-spike` command: one prompt from the terminal                                               |

## Data flow

```text
caller ── request({type}) ──► PiRpcClient ── encodeJsonl({...command, id: "req-N"}) ──► pi stdin
                                                                                          │
caller ◄─ Promise<RpcResponse> ◄─ pending[id] ◄─┐                                         ▼
                                                 ├─ classifyRecord ◄─ JsonlDecoder ◄─ pi stdout (bytes)
listeners ◄──────────── RpcEvent (in order) ◄────┘
logger ◄──────────── malformed / invalid / unmatched records, every stderr line
```

## Behaviour contract

These are the guarantees the tests in `test/` assert against the real pinned pi CLI (`@earendil-works/pi-coding-agent`, exact version in `package.json`).

**Framing** (`JsonlDecoder`)

- A record ends at an LF byte only; one CR before the LF is dropped. U+2028/U+2029 inside strings never split a record.
- Records and multi-byte UTF-8 characters split across chunks are reassembled.
- Blank lines are skipped. A non-JSON line yields `{ kind: 'malformed' }` and decoding continues with the next line. Bytes left without a final LF at end of stream yield a malformed "truncated" entry.
- `encodeJsonl` writes exactly one line per record and escapes U+2028/U+2029.

**Requests** (`PiRpcClient.request`)

- Each command gets a unique id `req-1`, `req-2`, …; responses are matched by id, so pi may answer in any order (it does).
- Resolves with the response when `success: true`. Rejects with `PiRpcCommandError` (message includes pi's `error`) when `success: false`, with `PiRpcTimeoutError` after `requestTimeoutMs` (default 30 s), and with `PiRpcExitedError` if pi exits first or has already exited.
- Honours stdin backpressure (waits for `drain`).

**Events** (`PiRpcClient.onEvent`)

- Every stdout record whose `type` is not `response` is delivered to every listener, in stream order. Register before prompting.
- A listener that throws is logged and the error is re-thrown.

**Diagnostics**

- Malformed lines, non-object records, responses with an unknown or missing id: logged at `error` and otherwise ignored; the client keeps serving.
- Each stderr line from pi: logged at `info` with field `stderr`. Never parsed.

**Lifecycle**

- `PiRpcClient.start` resolves once the process has spawned, or rejects with `PiRpcStartError` naming the command (for example when the executable does not exist).
- `close()` closes pi's stdin (pi's documented shutdown request), waits for exit, and sends SIGTERM after `closeGraceMs` (default 5 s). Returns the exit; safe to call twice.
- `exited` resolves with `{ code, signal }` when the process ends; the exit is logged (`info` for code 0, `warn` otherwise).

**Prompt runs** (`runPrompt`)

- Sends `prompt`, forwards each `text_delta` to `onTextDelta`, and resolves after `agent_settled` with `{ disposition, text, aborted, errorMessage }`. `text` is the last assistant `message_end` text, which pi treats as authoritative over the deltas.
- Returns immediately with empty text when pi answers `disposition: "handled"` (no run started).
- Rejects if pi rejects the prompt or exits before settling.

## Logging

Every line on stderr is one JSON object:

| Field       | Always | Meaning                                               |
| ----------- | ------ | ----------------------------------------------------- |
| `time`      | yes    | ISO-8601 timestamp                                    |
| `level`     | yes    | `trace`, `debug`, `info`, `warn`, `error`, or `fatal` |
| `component` | yes    | Subsystem, for example `rpc-spike`                    |
| `msg`       | yes    | What happened                                         |
| `piCommand` | client | Executable of the pi child the line is about          |
| `err`       | errors | `{ type, message, stack }`                            |

`PIRC_LOG_LEVEL` sets the minimum level (default `info`); an unknown value is an error.

## Tests

| File                         | What it proves                                                             |
| ---------------------------- | -------------------------------------------------------------------------- |
| `test/jsonl-framing.test.ts` | Framing rules above, byte for byte                                         |
| `test/pi-rpc-client.test.ts` | Requests, events, prompt runs, and failure modes against real pi and fakes |
| `test/rpc-spike-cli.test.ts` | The documented `rpc-spike` command: stdout, exit codes, log format         |

pi runs fully isolated: an empty temporary agent directory (`PI_CODING_AGENT_DIR`), an empty workspace, `--offline`, and a local scripted OpenAI-compatible server instead of a real model (`test/support/`). No credentials or network are needed.
