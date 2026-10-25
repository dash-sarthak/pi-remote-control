#!/usr/bin/env node
/**
 * Installs, removes, or prints the systemd user timer that runs audits.
 *
 * Usage: `node schedule-audits.mjs install|remove|print`
 *
 * The timer fires daily at 09:00 and on the next boot after a missed run. It
 * starts `start-audit.mjs --if-due`, which does nothing unless 15 days have
 * passed since the latest audit, so audits run every 15 days even when the
 * machine was off on the due date. Units are written to
 * `~/.config/systemd/user/pirc-audit.{service,timer}`.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const UNIT = 'pirc-audit';

/**
 * Renders both unit files for a repository checkout.
 *
 * @param {{ repoRoot: string, nodePath: string, pathEnv: string }} host
 * @returns {{ service: string, timer: string }}
 */
export function renderUnits({ repoRoot, nodePath, pathEnv }) {
  const service = [
    '[Unit]',
    'Description=pi-remote-control periodic audit (runs only when due)',
    'Wants=network-online.target',
    'After=network-online.target',
    '',
    '[Service]',
    'Type=oneshot',
    `WorkingDirectory=${repoRoot}`,
    `Environment=PATH=${pathEnv}`,
    `ExecStart=${nodePath} ${join(repoRoot, '.agents/skills/judge/scripts/start-audit.mjs')} --if-due`,
    '',
  ].join('\n');
  const timer = [
    '[Unit]',
    'Description=Check daily whether a pi-remote-control audit is due',
    '',
    '[Timer]',
    'OnCalendar=*-*-* 09:00:00',
    'Persistent=true',
    '',
    '[Install]',
    'WantedBy=timers.target',
    '',
  ].join('\n');
  return { service, timer };
}

/**
 * Runs `systemctl --user` with `args`.
 *
 * @param {string[]} args
 */
function systemctl(args) {
  execFileSync('systemctl', ['--user', ...args], { stdio: 'inherit' });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const action = process.argv[2];
  const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
    cwd: fileURLToPath(new URL('.', import.meta.url)),
    encoding: 'utf8',
  }).trim();
  const units = renderUnits({
    repoRoot,
    nodePath: process.execPath,
    pathEnv: process.env.PATH ?? '/usr/bin:/bin',
  });
  const unitDir = join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'systemd/user');
  if (action === 'print') {
    process.stdout.write(`# ${UNIT}.service\n${units.service}\n# ${UNIT}.timer\n${units.timer}`);
  } else if (action === 'install') {
    mkdirSync(unitDir, { recursive: true });
    writeFileSync(join(unitDir, `${UNIT}.service`), units.service);
    writeFileSync(join(unitDir, `${UNIT}.timer`), units.timer);
    systemctl(['daemon-reload']);
    systemctl(['enable', '--now', `${UNIT}.timer`]);
  } else if (action === 'remove') {
    systemctl(['disable', '--now', `${UNIT}.timer`]);
    rmSync(join(unitDir, `${UNIT}.service`), { force: true });
    rmSync(join(unitDir, `${UNIT}.timer`), { force: true });
    systemctl(['daemon-reload']);
  } else {
    process.stderr.write('usage: schedule-audits.mjs install|remove|print\n');
    process.exit(2);
  }
}
