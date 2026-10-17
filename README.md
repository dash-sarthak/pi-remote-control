# pi-remote-control

Control [pi](https://github.com/earendil-works/pi) coding-agent sessions running on your laptop from your phone.

```text
Phone (Expo app) ⇄ WebSocket over Tailscale ⇄ bridge daemon ⇄ pi --mode rpc (per session)
```

Status: foundations (toolchain, app scaffold, docs) are in place; the bridge and app features are being built — see [PLAN.md](PLAN.md).

## Prerequisites

- Node 22+ and pnpm 10 (`npm install -g pnpm`)
- [pi CLI](https://github.com/earendil-works/pi) on your PATH
- [Tailscale](https://tailscale.com) on laptop and phone
- Expo Go on your Android phone (for development)

## Quick start

```sh
pnpm install
pnpm typecheck && pnpm lint && pnpm test   # verify the workspace
pnpm dev:android                           # start the app (Expo Go)
```

## Layout

| Path                | What                                        |
| ------------------- | ------------------------------------------- |
| `apps/mobile`       | Expo app (SDK, expo-router, TypeScript)     |
| `apps/bridge`       | Bridge daemon (Node) — planned, see PLAN.md |
| `packages/protocol` | Shared WebSocket protocol types             |

## Docs

- [PLAN.md](PLAN.md) — goal, architecture, phases, decisions
- [RUNBOOK.md](RUNBOOK.md) — operational procedures and troubleshooting
- [AGENTS.md](AGENTS.md) — conventions for AI coding agents
- [CHANGELOG.md](CHANGELOG.md) — notable changes per version
