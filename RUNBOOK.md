# RUNBOOK.md

Operational procedures for developing and running pi-remote-control. Each procedure lists prerequisites, steps, verification, and failure branches. Procedures marked **(planned)** describe phases not yet implemented — see [PLAN.md](PLAN.md).

## Dev loop: app on a physical phone (primary)

No Android Studio, no SDK install — Expo Go renders the app.

**Prerequisites:** Node 22+, pnpm, laptop and phone on the same Wi-Fi (or paired via Tailscale, below), Expo Go installed on the phone.

1. `pnpm --filter mobile android` (starts the Metro dev server and prints a QR code).
2. Scan the QR with the Expo Go app.

**Verify:** the template app renders on the phone; Metro shows the bundle request.

**Failure branches:**

- _Phone can't reach Metro:_ same network? Corporate Wi-Fi client isolation? Fall back to `pnpm --filter mobile start --tunnel` (relays via Expo) or use Tailscale (below).
- _Expo Go shows an SDK-mismatch banner:_ the installed Expo Go build predates the SDK in `apps/mobile/package.json` — update Expo Go from the store.

## Dev loop: Tailscale (any network)

**Prerequisites:** Tailscale on laptop and phone, both logged into the same tailnet.

1. `tailscale status` on the laptop — note its MagicDNS name (e.g. `laptop.tailnet-name.ts.net`).
2. On the phone, open `exp://<laptop-tailnet-name>:8081` in Expo Go (Metro must run with LAN access: `pnpm --filter mobile start`).

**Verify:** app loads over the tailnet with Wi-Fi disabled on the phone (cellular on).

**Failure branches:**

- _Unreachable:_ `tailscale ping <phone>` from the laptop; check both devices are up in the admin console.
- _Firewall:_ Tailscale is outbound-only; if a host firewall blocks the tailscale0 interface, allow it rather than opening ports.

## Android Emulator without Android Studio (optional)

> **Host status (verified 2026-10-16):** this machine currently **cannot** run the emulator —
> `vmx` is absent from cpuinfo, the kvm module is not loaded, and `/dev/kvm` does not exist.
> Enable VT-x in BIOS/UEFI (then verify with `lscpu | grep Virtualization`) before using this
> section. Until then, the phone-based loop above is the only way to run the app.

**Prerequisites:** KVM working (`lscpu | grep -i Virtualization` shows a line; user can access `/dev/kvm`), JDK 17+.

1. Download only the command-line tools: Android SDK "Command line tools" zip from developer.android.com; unzip to `~/android-sdk/cmdline-tools/latest`.
2. `sdkmanager "platform-tools" "emulator" "platforms;android-35" "system-images;android-35;google_apis;x86_64"` (accept licenses with `--licenses`).
3. `avdmanager create avd -n pirc --package "system-images;android-35;google_apis;x86_64" --device pixel_6`.
4. `emulator -avd pirc` and `pnpm --filter mobile android`.

**Verify:** emulator boots; Expo Go (install the APK inside the emulator) or the Expo dev client loads the app.

**Failure branches:**

- _Emulator won't start: KVM._ `/dev/kvm` must be owned by your user (`sudo chown $USER /dev/kvm` or add to the `kvm` group).
- _Emulator can't reach the laptop:_ use `10.0.2.2` (the emulator's alias for host loopback), never `localhost` — this will matter for the bridge URL (planned).

## Prompt pi from the command line (rpc-spike)

Phase 1 proof that the bridge drives `pi --mode rpc`: one prompt in, the streamed reply out. Design and guarantees: [apps/bridge/README.md](apps/bridge/README.md).

**Prerequisites:** `pnpm install` done; `pi --version` works; pi has a default model with credentials (a plain `pi` session can answer a prompt).

1. From the repository root:

   ```sh
   pnpm --silent --filter @pirc/bridge rpc-spike --cwd "$PWD" "Reply with exactly: hello from pi"
   ```

   Options: `--cwd DIR` (the project pi works in; default `apps/bridge`), `--provider NAME`, `--model ID` (default: pi's configured default). Set `PIRC_PI_COMMAND` to use a pi executable other than `pi` on PATH, and `PIRC_LOG_LEVEL=debug` to log every command and response.

**Verify:**

- The reply prints to stdout as it streams, followed by a newline (here: `hello from pi`).
- Exit code is 0 (`echo $?`).
- stderr holds only JSON lines, including `"msg":"pi process started"`, `"msg":"prompt settled"` with `"aborted":false`, and `"msg":"pi process exited"` with `"code":0`.

**Failure branches:**

- _Exit 2, `usage: rpc-spike …` logged:_ no prompt was given, or an option is unknown.
- _Exit 1, `"msg":"rpc-spike failed"` with `failed to start pi (pi)`:_ pi is not on PATH (or `PIRC_PI_COMMAND` is wrong). Install pi or fix the path.
- _Exit 1, error contains `No API key found`:_ pi has no credentials for its default model. Run `pi` and `/login`, or pass `--provider`/`--model` for a configured one.
- _Exit 1, `"msg":"prompt settled"` with an `errorMessage`:_ the model provider failed (outage, quota). The message is the provider's; retry later.

## Bridge operations (planned)

Bridge start/stop, pairing (QR token), project allowlist configuration, and log locations get documented here when Phase 2–4 land. Do not invent CLI flags before they exist.

## Agent tooling: Expo MCP server

`.pi/mcp.json` registers the official Expo MCP server (`https://mcp.expo.dev/mcp`) for AI agents working in this repo — live Expo docs (`read_documentation`, `learn`), version-correct installs (`add_library`), and later EAS build tools.

1. Trust the project when pi prompts on first start in it (required before `.pi/mcp.json` is read).
2. `/mcp` in a pi session shows the server state; first use needs `/mcp login expo` (OAuth in browser).
3. Claude Code reads the same file through the `.mcp.json` symlink; approve the `expo` server when Claude Code asks, then authenticate with `/mcp`.

**Verify:** `/mcp` lists `expo` as connected with tools.

**Failure branches:**

- _"ignored because the project is not trusted":_ accept the trust prompt when starting pi in this directory.
- _Auth errors:_ re-run `/mcp login expo`.

## Audits

An independent judge audits the repository every 15 days: code, HLD, LLD, comments, documentation, tooling, CI, hygiene, security, and the product's output, the last by running the documented procedures in this file. Each audit runs in a fresh session with no project instructions, memory, or saved sessions. Audits alternate harnesses: even numbers on Claude Code (model `opus`), odd numbers on pi (model `zai-coding-cn/glm-5.3`). Results:

- branch `audit/N` on GitHub, containing `audit/N/report.md` and `audit/N/findings.json`
- GitHub issue titled `audit/N` with label `audit`, whose body is the report
- local copy in `./audit/N/` (git-ignored on `main`), plus `session.log`, the judge's full output

Numbers start at 0 and increase by one per audit.

### Run an audit now

**Prerequisites:** `gh auth status` shows you logged in; `claude` (for even audits) or `pi` (for odd) on PATH and logged in; push access to `origin`; the code to audit is on `origin/main` (the judge audits `origin/main`, not your working tree).

1. Preview: `pnpm -s audit:start --dry-run` prints the plan (number, harness, model, worktree path) as JSON and changes nothing.
2. Run: `pnpm -s audit:start`. Add `--harness pi` or `--harness claude-code`, and `--model ID`, to override the alternation.

**Verify:** the last stderr line is JSON with `"msg":"audit published"` and an `issueUrl`; `./audit/N/report.md` exists; `gh issue list --label audit` lists `audit/N`.

**Failure branches:**

- _`"msg":"judge session failed; worktree kept for inspection"`:_ the harness exited non-zero. Read `./audit/N/session.log`. Remove the worktree and the unpublished branch before retrying: `git worktree remove --force <worktree>` and `git branch -D audit/N`.
- _`"msg":"judge output is invalid"`:_ the judge wrote a `findings.json` that breaks the report format; the log lists each problem. Clean up as above and rerun.
- _`"msg":"audit failed"` mentioning `git push` or `gh`:_ check `gh auth status` and push access, then clean up as above.

### Schedule audits every 15 days

1. `pnpm -s audit:schedule install` writes `~/.config/systemd/user/pirc-audit.{service,timer}` and enables the timer. It checks daily at 09:00, catches up after the machine was off, and starts an audit only when 15 days have passed since the latest one.
2. For the timer to run while you are logged out: `loginctl enable-linger "$USER"`.

**Verify:** `systemctl --user list-timers pirc-audit.timer` shows the next run. After a run: `journalctl --user -u pirc-audit.service` shows either `"msg":"audit not due"` or the audit's log.

**Inspect or remove:** `pnpm -s audit:schedule print` shows the unit files; `pnpm -s audit:schedule remove` disables and deletes them.

**Failure branches:**

- _Journal shows `claude: command not found` or `gh` auth errors:_ the unit captured the PATH of the shell you installed from; reinstall from a shell where `claude`, `pi`, `gh`, `node`, and `pnpm` all resolve.

## Harness parity (Claude Code and pi)

Both harnesses read the same instructions, skills, and MCP servers through symlinks (`CLAUDE.md -> AGENTS.md`, `.claude/skills -> ../.agents/skills`, `.mcp.json -> .pi/mcp.json`).

**Verify:** `pnpm --filter @pirc/tooling test` passes; its harness-parity test names any file that breaks parity and what it must be instead.

## Troubleshooting quick table

| Symptom                                | Likely cause                      | Fix                                                                               |
| -------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------- |
| `pnpm: command not found`              | Not installed / PATH              | `npm install -g pnpm` (installs to `~/.local/bin`)                                |
| `pi: command not found` in bridge logs | pi CLI missing on PATH            | Install pi; verify `pi --version`                                                 |
| Wrong node version                     | nvm not loaded                    | `nvm use` (repo pins Node 22 via `.nvmrc`)                                        |
| Commit blocked by commitlint           | Message not Conventional Commits  | Prefix with `feat:`/`fix:`/`chore:` …                                             |
| CI red, local green                    | Frozen lockfile drift or env diff | `pnpm install --frozen-lockfile` locally; compare Node version (CI uses `.nvmrc`) |
