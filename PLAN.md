# PLAN.md

## Goal

Run pi coding-agent sessions on the laptop and drive them from a phone: send prompts, watch responses stream in real time, approve tool calls, and get notified when a run finishes or needs attention. The agent and the code stay on the laptop; the phone is a remote control.

Networking follows the pattern Claude Code's Remote Control and Happy use: **outbound-only connections, no inbound ports**. The laptop never exposes a listening port to the internet; transport is a Tailscale mesh (each side dials out), with a pairing token on top.

## Non-goals (for now)

- Controlling live interactive TUI sessions (headless `pi --mode rpc` sessions only; terminal-created sessions can be resumed because session files are shared)
- Public-internet relay with end-to-end encryption (Happy-style) — revisit if we drop Tailscale
- iOS (no iOS Simulator exists on this Linux host; revisit via EAS + physical device)
- Web/desktop clients: the app is optimised for phones only, and its web target has been removed

## HLD

```text
┌──── Phone ───┐          ┌───────────────────────────── Laptop ─────────────────────────────┐
│              │          │                                                                  │
│  Expo app    │◆──────◆│  bridge daemon (Node)              pi --mode rpc  × N            │
│  - chat UI   │Tailscale │  - WebSocket server (auth token)    - one child per session      │
│  - approvals │  (WS)    │  - session lifecycle / registry     - JSONL stdin/stdout         │
│  - notify    │          │  - approval forwarding              - events: text_delta, tool…  │
└──────────────┘          │  - offline notification queue       - repos on local disk        │
                          └──────────────────────────────────────────────────────────────────┘
```

- One phone connection multiplexes many sessions (`sessionId` on every envelope).
- Bridge translates WS envelopes ⇄ pi RPC records (JSONL on the child's stdio, strict LF framing, never Node `readline`).
- Terminal-created sessions appear in the app by reading the shared session directory; resuming uses RPC `switch_session`.

## MVP

1. **Chat + streaming** — prompt a session, stream `text_delta` output, `message_end` as authoritative text, steer/follow-up/abort, model switch.
2. **Tool-call approvals** — pi extension-UI permission dialogs surfaced as phone cards; verdict returned within a timeout (default deny).
3. **Notifications** — local notifications (app alive, socket open) when a run settles or an approval is pending while backgrounded; missed events queued and replayed on reconnect.
4. **Session lifecycle** — create a headless session for an allowlisted project dir; list and resume existing sessions.

## Phases

1. **RPC transport spike** (proof-of-risk, gates everything): bridge spawns `pi --mode rpc`, byte-stream JSONL reader (split on LF, strip CR), id correlation, event subscription. Tested from a Node script client before any mobile code.
2. **Session lifecycle over WS**: project allowlist (bridge config), create/resume/list/close; envelope multiplexing.
3. **Approval forwarding**: `extension_ui_request` ⇄ phone card ⇄ `extension_ui_response`; generic approve/deny fallback for unsupported dialogs. Risk: if pi's permission prompts turn out to be TUI-only, add a small pi extension beside the bridge — verify during this phase before building the API.
4. **Pairing + security**: one-time QR pairing (URL + token), token required per connection, bind to Tailscale interface (localhost for dev).
5. **Mobile chat UI**: streaming text, tool-call cards, steer/follow-up composer, abort, model picker, reconnect with `get_state`/`get_messages` resync.
6. **Approvals + notifications UI**: approval cards, local notifications, reconnect replay.
7. **End-to-end verification**: phone over Tailscale → real task → steer → remote approval → kill/reopen app → resync.

## Decisions

| Decision        | Choice                                                                                                                                                                                         | Rationale                                                                                                                                                     |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Transport       | Tailscale mesh + pairing token                                                                                                                                                                 | Same outbound-only property as Claude Code Remote Control with zero relay code; E2E-encrypted by the mesh                                                     |
| Sessions        | Headless `pi --mode rpc` per project                                                                                                                                                           | Fully supported RPC mode; terminal sessions still listable/resumable via shared session files                                                                 |
| Mobile stack    | Expo (SDK 58) + expo-router + TypeScript                                                                                                                                                       | Official template defaults; one TS codebase; Android-first (Linux host, no iOS Simulator)                                                                     |
| Emulators       | Physical phone via Expo Go + Tailscale; optional Android Emulator via SDK cmdline-tools                                                                                                        | User constraint: no Android Studio; Expo Go needs no SDK install                                                                                              |
| UI styling      | Plain RN + `theme/tokens.ts` (Material 3 primary, Apple HIG secondary)                                                                                                                         | Official design guidelines only; zero styling deps                                                                                                            |
| Monorepo        | pnpm workspaces + Turborepo                                                                                                                                                                    | Standard, minimal; shared TS protocol package                                                                                                                 |
| Checks          | TS strict, ESLint 9 flat, Prettier, Vitest, husky/lint-staged, commitlint, GitHub Actions (SHA-pinned)                                                                                         | Production-grade from day 1; CI mirrors local `turbo` pipeline                                                                                                |
| pi RPC client   | Own `PiRpcClient` in `apps/bridge/src/pi-rpc`, not pi's exported `RpcClient`                                                                                                                   | The bridge must own framing, id correlation, timeouts, exit handling, and logging to forward them to the phone; ~300 lines, fully tested against the real CLI |
| pi record types | `apps/bridge/src/pi-rpc/records.ts`; phone envelopes stay in `packages/protocol`                                                                                                               | Bridge ⇄ pi is a different boundary from phone ⇄ bridge; validated with type guards on every record                                                           |
| Logging         | pino, JSON lines on stderr (`time`, `level`, `component`, `msg`), `PIRC_LOG_LEVEL`                                                                                                             | Structured from day 1; stdout stays free for program output; machine-parseable for tests and audits                                                           |
| Test strategy   | Output-oriented TDD against the **real** pi CLI pinned in devDependencies, isolated by a temp agent dir, plus a local scripted OpenAI-compatible model server                                  | Deterministic, offline, credential-free, and catches real protocol drift when pi is upgraded                                                                  |
| Harness parity  | `AGENTS.md`, `.agents/skills`, `.pi/mcp.json` canonical; `CLAUDE.md`, `.claude/skills`, `.mcp.json` are symlinks; enforced by a test                                                           | Claude Code and pi must behave the same; one source of truth, no drift                                                                                        |
| Audits          | Judge skill (`.agents/skills/judge`), every 15 days via a systemd user timer, alternating Claude Code / pi, isolated from project instructions and memory, results on `audit/N` branch + issue | Independent, evidence-backed review; alternating model families counters a judge favouring its own model's code                                               |

## Status

- [x] Foundations: toolchain, git hygiene, CI, Expo scaffold, docs (this commit set)
- [x] Phase 1: RPC transport spike (`apps/bridge`, see [apps/bridge/README.md](apps/bridge/README.md); `rpc-spike` in RUNBOOK.md)
- [ ] Phase 2: session lifecycle
- [ ] Phase 3: approval forwarding
- [ ] Phase 4: pairing + security
- [ ] Phase 5: mobile chat UI
- [ ] Phase 6: approvals + notifications UI
- [ ] Phase 7: end-to-end verification
