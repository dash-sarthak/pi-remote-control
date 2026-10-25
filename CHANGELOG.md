# CHANGELOG.md

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/2.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `rpc-spike` command (`pnpm --filter @pirc/bridge rpc-spike "…"`): prompts pi from the terminal and streams the reply; the Phase 1 proof that the bridge drives `pi --mode rpc` (RUNBOOK.md).
- Bridge pi RPC transport: byte-level JSONL framing, id-correlated requests with timeouts, ordered event delivery, prompt runs that wait for `agent_settled`, and typed failures for start, rejection, timeout, and exit.
- Structured JSON logging on stderr for the bridge and repository scripts (`PIRC_LOG_LEVEL`).
- Independent audits on demand: an `audit` skill (`/audit claude|glm` in Claude Code, `/skill:audit claude|glm` in pi) starts the shared judge skill in an isolated session and publishes results as `audit/N` branches and issues (RUNBOOK.md#audits).
- Claude Code and pi load identical instructions, skills, and MCP servers through symlinks, enforced by a test.
- Stricter tooling: type-aware `strictTypeChecked` lint, required docstrings, a ban on banner comments and `console.*`, repository-wide Prettier check, and `pnpm verify`.

### Changed

- The mobile app targets Android and iOS only; the web target and web-only code were removed.
- `isEnvelope` now rejects unknown envelope types and non-string correlation ids.

- pnpm + Turborepo monorepo with `packages/protocol` (WebSocket envelope types + validation), `apps/bridge` (daemon placeholder), `apps/mobile` (Expo SDK 58, expo-router, TypeScript strict).
- Production toolchain from day 1: ESLint 9 flat config, Prettier, Vitest, husky + lint-staged pre-commit, commitlint (Conventional Commits), GitHub Actions CI with SHA-pinned actions and least-privilege permissions.
- Project docs: PLAN.md (goal, HLD, MVP, phases, decisions), RUNBOOK.md, AGENTS.md.
- Expo MCP server registered for AI agents (`.pi/mcp.json`), documented in RUNBOOK.md.
