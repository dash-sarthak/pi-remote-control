# AGENTS.md

Instructions for AI coding agents working in this repository. Architecture and product decisions live in [PLAN.md](PLAN.md); operational procedures in [RUNBOOK.md](RUNBOOK.md).

## Commands

```sh
pnpm install                 # after pulling or changing dependencies
pnpm typecheck               # turbo: tsc --noEmit in all workspaces
pnpm lint                    # turbo: eslint in all workspaces
pnpm test                    # turbo: vitest (protocol, bridge)
pnpm build                   # turbo: build all workspaces
pnpm --filter mobile android # Expo dev server for Android
```

Run `pnpm typecheck && pnpm lint && pnpm test` before declaring any task done. CI runs the same pipeline plus `pnpm build` and blocks merges on failure.

## Conventions

- TypeScript strict everywhere (`tsconfig.base.json`); no `any` without a comment explaining why.
- Protocol message shapes are defined in `packages/protocol` first; `apps/bridge` and `apps/mobile` consume them. Never redefine an envelope inline.
- The bridge's pi RPC stream is JSONL over a byte stream: split records on LF only, strip an optional leading CR, and never use Node's `readline` (it also splits on U+2028/U+2029, which are legal inside JSON strings).
- Errors propagate; do not swallow them. At trust boundaries (WS input, RPC records), validate with explicit type guards.
- Every user-facing flow must handle disconnects: reconnect + resync is part of the feature, not an afterthought.
- Commit messages follow Conventional Commits (enforced by commitlint); husky runs lint-staged and commitlint locally.
- UI values come from `apps/mobile/src/theme/tokens.ts` (Material 3 primary, Apple HIG secondary) — no ad-hoc hex or pixel values in screens.

## PR checklist

- [ ] `pnpm typecheck && pnpm lint && pnpm test` green locally
- [ ] New behavior has a test, or the change is trivially mechanical
- [ ] Notable user-visible changes get a [CHANGELOG.md](CHANGELOG.md) entry under `[Unreleased]`
- [ ] Protocol changes are made in `packages/protocol` and both consumers updated
