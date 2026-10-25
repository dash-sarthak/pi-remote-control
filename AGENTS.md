# AGENTS.md

Instructions for AI coding agents working in this repository. Architecture and product decisions live in [PLAN.md](PLAN.md); operational procedures in [RUNBOOK.md](RUNBOOK.md).

This codebase is written and maintained by agents only. The owner does not read code; they judge the product by running it through the documented steps. Documentation and tests are therefore the only way intent survives between sessions: keep them exact.

## Commands

```sh
pnpm install                 # after pulling or changing dependencies
pnpm verify                  # typecheck + lint + test + format check, all workspaces
pnpm typecheck               # turbo: tsc in all workspaces (tests included)
pnpm lint                    # turbo: type-aware eslint in all workspaces
pnpm test                    # turbo: vitest (protocol, bridge, tooling)
pnpm build                   # turbo: build all workspaces
pnpm --filter mobile android # Expo dev server for Android
```

Run `pnpm verify` before declaring any task done. CI runs it plus `pnpm build` and blocks merges on failure.

## Harness parity

Claude Code and pi must behave identically in this repository. Both read the same files:

| What         | Edit this                        | The other harness reads it through                 |
| ------------ | -------------------------------- | -------------------------------------------------- |
| Instructions | `AGENTS.md` (any directory)      | `CLAUDE.md`, a symlink to `AGENTS.md`              |
| Skills       | `.agents/skills/<name>/SKILL.md` | `.claude/skills`, a symlink to `../.agents/skills` |
| MCP servers  | `.pi/mcp.json`                   | `.mcp.json`, a symlink to `.pi/mcp.json`           |

- Never put instructions where only one harness looks (`.claude/commands`, `.claude/agents`, `.pi/prompts`, `.pi/extensions`, `.pi/APPEND_SYSTEM.md`, …), and never keep project rules in a harness's private memory. Rules go in this file.
- A new `AGENTS.md` in a subdirectory needs a `CLAUDE.md -> AGENTS.md` symlink beside it.
- `packages/tooling/test/harness-parity.test.ts` enforces all of this as part of `pnpm test`.

## How to work

- **TDD, always.** Write the failing test first, watch it fail, then write the code. Tests assert observable output (return values, stdout and stderr, exit codes, emitted records, files written), never implementation details such as private calls or mocks of internals. Prefer real dependencies (the pinned pi CLI, real child processes, real sockets) over test doubles; fake only what is outside the repository's control, such as the LLM (see `apps/bridge/test/support/scripted-model-server.ts`).
- **BDD names.** Name tests as behaviour: `describe('Given …')` with `it('when …, then …')`, or a plain sentence stating the behaviour.
- **Deterministic.** No real network, credentials, wall-clock races, or reliance on the developer's machine in tests. Isolate pi with `test/support/isolated-pi.ts`.
- **Readable over clever.** Plain control flow, descriptive names, no premature optimisation, no tricks. Code must be reproducible and testable by an agent with no memory of writing it.
- **Docstrings over comments.** Every exported symbol has a TSDoc/JSDoc docstring stating its contract (lint-enforced). Inline comments only when the code cannot say why. No banner or divider comments such as `// --- section ---` (lint-enforced by `pirc/no-banner-comments`).
- **Structured logging everywhere.** Use `createLogger` from `apps/bridge/src/logging/logger.ts` (pino, JSON lines on stderr, fields `time`, `level`, `component`, `msg`). No `console.*` in product code (lint-enforced). Log errors as `{ err }`.
- **Document as you build.** Behaviour that is not written in a Markdown file does not exist for the next agent. Module design goes in the workspace README (for example [apps/bridge/README.md](apps/bridge/README.md)); procedures go in RUNBOOK.md; decisions go in PLAN.md.
- **Phones only.** The app targets Android and iOS. Do not add web or desktop targets or web-only code paths.

## Conventions

- TypeScript strict everywhere (`tsconfig.base.json`); type-aware `strictTypeChecked` lint; no `any` without a comment explaining why.
- Phone ⇄ bridge message shapes are defined in `packages/protocol` first; `apps/bridge` and `apps/mobile` consume them. Never redefine an envelope inline. Bridge ⇄ pi record shapes live in `apps/bridge/src/pi-rpc/records.ts`.
- The bridge's pi RPC stream is JSONL over a byte stream: split records on LF only, strip an optional leading CR, and never use Node's `readline` (it also splits on U+2028/U+2029, which are legal inside JSON strings). Use `JsonlDecoder`.
- Errors propagate; do not swallow them. At trust boundaries (WS input, RPC records), validate with explicit type guards.
- Every user-facing flow must handle disconnects: reconnect + resync is part of the feature, not an afterthought.
- Commit messages follow Conventional Commits (enforced by commitlint); husky runs lint-staged and commitlint locally.
- UI values come from `apps/mobile/src/theme/tokens.ts` (Material 3 primary, Apple HIG secondary) — no ad-hoc hex or pixel values in screens.
- Pin exact versions for tools whose behaviour tests depend on (the pi CLI is pinned in `apps/bridge` devDependencies).

## PR checklist

- [ ] `pnpm verify` green locally
- [ ] New behaviour has an output-oriented test written before the code, or the change is trivially mechanical
- [ ] Docs updated: module README for design, RUNBOOK.md for procedures, PLAN.md for decisions and status
- [ ] Notable user-visible changes get a [CHANGELOG.md](CHANGELOG.md) entry under `[Unreleased]`
- [ ] Protocol changes are made in `packages/protocol` and both consumers updated
