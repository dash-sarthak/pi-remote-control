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

**Prerequisites:** KVM working (`grep -c vmx /proc/cpuinfo` or `lscpu | grep Virtualization`; install `qemu-kvm` group access if missing), JDK 17+.

1. Download only the command-line tools: Android SDK "Command line tools" zip from developer.android.com; unzip to `~/android-sdk/cmdline-tools/latest`.
2. `sdkmanager "platform-tools" "emulator" "platforms;android-35" "system-images;android-35;google_apis;x86_64"` (accept licenses with `--licenses`).
3. `avdmanager create avd -n pirc --package "system-images;android-35;google_apis;x86_64" --device pixel_6`.
4. `emulator -avd pirc` and `pnpm --filter mobile android`.

**Verify:** emulator boots; Expo Go (install the APK inside the emulator) or the Expo dev client loads the app.

**Failure branches:**

- _Emulator won't start: KVM._ `/dev/kvm` must be owned by your user (`sudo chown $USER /dev/kvm` or add to the `kvm` group).
- _Emulator can't reach the laptop:_ use `10.0.2.2` (the emulator's alias for host loopback), never `localhost` — this will matter for the bridge URL (planned).

## Bridge operations (planned)

Bridge start/stop, pairing (QR token), project allowlist configuration, and log locations get documented here when Phase 2–4 land. Do not invent CLI flags before they exist.

## Agent tooling: Expo MCP server

`.pi/mcp.json` registers the official Expo MCP server (`https://mcp.expo.dev/mcp`) for AI agents working in this repo — live Expo docs (`read_documentation`, `learn`), version-correct installs (`add_library`), and later EAS build tools.

1. Trust the project when pi prompts on first start in it (required before `.pi/mcp.json` is read).
2. `/mcp` in a pi session shows the server state; first use needs `/mcp login expo` (OAuth in browser).

**Verify:** `/mcp` lists `expo` as connected with tools.

**Failure branches:**

- _"ignored because the project is not trusted":_ accept the trust prompt when starting pi in this directory.
- _Auth errors:_ re-run `/mcp login expo`.

## Troubleshooting quick table

| Symptom                                | Likely cause                      | Fix                                                                               |
| -------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------- |
| `pnpm: command not found`              | Not installed / PATH              | `npm install -g pnpm` (installs to `~/.local/bin`)                                |
| `pi: command not found` in bridge logs | pi CLI missing on PATH            | Install pi; verify `pi --version`                                                 |
| Wrong node version                     | nvm not loaded                    | `nvm use` (repo pins Node 22 via `.nvmrc`)                                        |
| Commit blocked by commitlint           | Message not Conventional Commits  | Prefix with `feat:`/`fix:`/`chore:` …                                             |
| CI red, local green                    | Frozen lockfile drift or env diff | `pnpm install --frozen-lockfile` locally; compare Node version (CI uses `.nvmrc`) |
