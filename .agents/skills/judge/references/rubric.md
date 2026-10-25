# Audit rubric

Rubric version: **1**. Increase it whenever a check is added, removed, or
reworded, and note the change at the bottom, so findings from different
versions are not compared as if they used the same yardstick.

Each check tests one observable property. Answer it pass, fail, or not
applicable, with the evidence the check names. Do not average or score.

## Severity

| Severity | Meaning                                                               | Example                                                            |
| -------- | --------------------------------------------------------------------- | ------------------------------------------------------------------ |
| critical | Security exposure, data loss, or the documented core flow cannot work | Pairing token logged in plain text; bridge crashes on every prompt |
| high     | A documented promise is broken, or a defect a user will hit           | Reconnect never resyncs; documented command fails                  |
| medium   | Defect with a workaround, or a gap that will cause defects soon       | Error path untested; doc step ambiguous                            |
| low      | Quality or consistency issue with no user impact yet                  | Misleading name; stale comment                                     |
| info     | Observation worth recording, not a defect                             | Dependency two majors behind                                       |

## Dimensions and checks

### output: the product does what the docs say

- O1. Every documented setup and run step executes as written, in order, without unstated prerequisites. Evidence: command, exit code, output.
- O2. The observable output of each documented run matches what the docs say it will be. Evidence: expected vs actual.
- O3. Documented failure behaviour (bad input, missing dependency, disconnect) behaves as described when triggered as described. Evidence: command and output.

### hld: high-level design

- H1. The architecture in PLAN.md matches the code's actual components and their connections. Evidence: doc passage plus the module that contradicts or confirms it.
- H2. Every architectural decision has a recorded rationale, and none contradicts another or the code. Evidence: decision rows.
- H3. Trust boundaries (network, process, user input) are identified in the design. Evidence: doc passage or its absence.

### lld: low-level design

- L1. Each module has one clear responsibility that its docstring states. Evidence: path:line.
- L2. Public interfaces validate untrusted input at trust boundaries with explicit checks. Evidence: path:line.
- L3. Errors propagate or are handled explicitly; none are silently swallowed. Evidence: path:line of each catch.
- L4. Concurrency, timeouts, and process lifecycles have defined behaviour (no unbounded waits, no orphaned processes). Evidence: path:line plus a test or command that proves it.

### code: readability and correctness

- C1. Code is readable without its author: names say what things are, control flow is direct, and there are no clever tricks or premature optimisation. Evidence: path:line.
- C2. No dead code, unused exports, or commented-out code. Evidence: path:line or tool output.
- C3. No `any`, non-null assertions, or type casts at trust boundaries without a stated reason. Evidence: path:line.

### tests

- T1. Tests assert observable output (return values, stdout, exit codes, emitted records, files) rather than implementation details (private calls, mocks of internals). Evidence: test path:line.
- T2. Every documented behaviour has a test; every bug fix has a regression test. Evidence: behaviour and the test, or its absence.
- T3. Tests are deterministic: no real network, wall-clock races, or reliance on the developer's machine. Run the suite twice and compare. Evidence: two run outputs.

### comments: docstrings and comments

- K1. Every exported symbol has a docstring that states its contract, not its implementation. Evidence: path:line.
- K2. Inline comments exist only where the code cannot say why; none restate the code, and none are banner or divider comments. Evidence: path:line.
- K3. No comment, docstring, or document contradicts the code. Evidence: both locations.

### documentation

- D1. A newcomer can set up, run, test, and operate the product from the docs alone. Evidence: O1 results plus gaps found.
- D2. Every operational procedure lists prerequisites, steps, verification, and failure branches. Evidence: section.
- D3. CHANGELOG.md records every user-visible change since the last audit. Evidence: commits vs entries.
- D4. No document is written for, or tailored to, the auditor. Evidence: passage.

### tooling

- TL1. Type checking is strict and covers every workspace, tests included. Evidence: config path:line.
- TL2. Linting is type-aware and enforces docstrings and comment rules. Evidence: config and `lint` output.
- TL3. Formatting, commit-message, and pre-commit checks run locally and in CI. Evidence: config.
- TL4. Claude Code and pi load identical instructions, skills, and MCP servers from the repository. Evidence: parity test output and the files it checks.

### ci

- CI1. CI runs every local check, and failing checks block merging. Evidence: workflow path:line.
- CI2. Third-party actions are pinned to full commit SHAs and permissions are least-privilege. Evidence: workflow path:line.
- CI3. CI is reproducible: frozen lockfile, pinned runtime versions. Evidence: workflow and config.

### hygiene

- HY1. The working tree contains no generated artefacts, secrets, large binaries, or stray files. Evidence: `git ls-files` excerpts.
- HY2. Commits follow Conventional Commits and each has one purpose. Evidence: `git log` excerpts.
- HY3. Dependencies are necessary, current within one major version, and have no known vulnerabilities. Evidence: `pnpm audit` and `pnpm outdated` output.
- HY4. Structured logging is used everywhere; there are no bare `console.*` calls in product code. Evidence: grep output.

### security

- S1. Network listeners bind only to the documented interfaces and require authentication. Evidence: path:line or "no listener yet".
- S2. Secrets (tokens, keys) are never logged, committed, or sent to the phone unnecessarily. Evidence: grep output and log samples.
- S3. Child processes are spawned without a shell and with validated arguments. Evidence: path:line.
- S4. Input from the phone and from pi is validated before use. Evidence: path:line.

### product scope

- P1. The mobile app targets phones only (Android and iOS); no web or desktop target ships. Evidence: app config.

## Rubric changes

- v1 (2026-10-25): initial rubric.
