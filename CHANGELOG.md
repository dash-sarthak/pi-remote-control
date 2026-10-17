# CHANGELOG.md

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/2.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- pnpm + Turborepo monorepo with `packages/protocol` (WebSocket envelope types + validation), `apps/bridge` (daemon placeholder), `apps/mobile` (Expo SDK 58, expo-router, TypeScript strict).
- Production toolchain from day 1: ESLint 9 flat config, Prettier, Vitest, husky + lint-staged pre-commit, commitlint (Conventional Commits), GitHub Actions CI with SHA-pinned actions and least-privilege permissions.
- Project docs: PLAN.md (goal, HLD, MVP, phases, decisions), RUNBOOK.md, AGENTS.md.
- Expo MCP server registered for AI agents (`.pi/mcp.json`), documented in RUNBOOK.md.
