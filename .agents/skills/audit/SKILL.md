---
name: audit
description: Start an independent audit of this repository by the judge, in a fresh isolated session, and publish it as the audit/N branch and issue. Use only when the user explicitly invokes this skill.
disable-model-invocation: true
---

# Audit

Starts the next audit. You do not audit anything yourself: the judge runs in a
separate, isolated session (see [../judge/SKILL.md](../judge/SKILL.md)) and
you only launch it and report the outcome. Audits run only when the user calls
this skill; nothing schedules them.

## Choose the judge

The words the user wrote after invoking this skill pick the judge:

| User wrote                             | `--harness`   | `--model`               |
| -------------------------------------- | ------------- | ----------------------- |
| `claude` or `claude-code`              | `claude-code` | `opus`                  |
| `glm` or `pi`                          | `pi`          | `zai-coding-cn/glm-5.3` |
| any of the above plus a model id       | as above      | that model id           |
| nothing                                | your harness  | that harness's default  |

"Your harness" is `claude-code` if you are running in Claude Code and `pi` if
you are running in pi. If the user wrote anything else, stop and show them this
table instead of guessing.

## Steps

1. Preview, and show the user the `audit`, `harness`, `model`, and `worktree`
   fields of the JSON it prints:

   ```sh
   node .agents/skills/judge/scripts/start-audit.mjs --dry-run --harness <harness> [--model <model>]
   ```

2. Run the same command without `--dry-run`. It can take hours. If your shell
   tool has a time limit or a background mode, run it in the background and
   wait for it to exit rather than letting the limit kill it. Do not run
   anything else in this repository while it runs.

3. Report the outcome from its last stderr line, which is JSON:
   - `"msg":"audit published"`: give the user the `issueUrl` and the
     `localCopy` path, and nothing else from the report.
   - any other `msg`: quote that line, then follow the matching failure branch
     in [RUNBOOK.md](../../../RUNBOOK.md#audits). Do not retry on your own.

Never edit, summarise, or argue with the judge's findings in this session.
