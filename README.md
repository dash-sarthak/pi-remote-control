# pi-remote-control

Control [pi](https://github.com/earendil-works/pi) coding-agent sessions running on your laptop from your phone.

```text
Phone (Expo app) ⇄ WebSocket over Tailscale ⇄ bridge daemon ⇄ pi --mode rpc (per session)
```

Status: Phase 1 done — the bridge can drive `pi --mode rpc` from the terminal (`rpc-spike`, see [RUNBOOK.md](RUNBOOK.md)). The phone link and app features come next — see [PLAN.md](PLAN.md).

## Prerequisites

- Node 22+ and pnpm 10 (`npm install -g pnpm`)
- [pi CLI](https://github.com/earendil-works/pi) on your PATH
- [Tailscale](https://tailscale.com) on laptop and phone
- Expo Go on your Android phone (for development)

## Quick start

```sh
pnpm install
pnpm verify                                # typecheck, lint, test, format check
pnpm dev:android                           # start the app (Expo Go)
```

## Layout

| Path                | What                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------ |
| `apps/mobile`       | Expo app (SDK, expo-router, TypeScript)                                                    |
| `apps/bridge`       | Bridge daemon (Node): pi RPC transport, see [apps/bridge/README.md](apps/bridge/README.md) |
| `packages/protocol` | Shared WebSocket protocol types                                                            |
| `packages/tooling`  | Repository checks: custom lint rules, harness-parity test                                  |
| `.agents/skills`    | Skills shared by Claude Code and pi (judge)                                                |

## Docs

- [PLAN.md](PLAN.md) — goal, architecture, phases, decisions
- [RUNBOOK.md](RUNBOOK.md) — operational procedures and troubleshooting
- [AGENTS.md](AGENTS.md) — conventions for AI coding agents (also read as `CLAUDE.md`)
- [CHANGELOG.md](CHANGELOG.md) — notable changes per version
