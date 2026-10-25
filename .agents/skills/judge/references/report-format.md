# Report format

An audit writes exactly two files to `audit/N/`. `findings.json` is the
machine-checked record; `report.md` is the same content for people and becomes
the body of the `audit/N` GitHub issue.

## findings.json

```json
{
  "audit": 0,
  "rubricVersion": 1,
  "date": "2026-10-25",
  "commit": "<full SHA audited>",
  "harness": "claude-code",
  "model": "<model id>",
  "summary": "<one paragraph: what the system is, per the docs, and its overall state>",
  "steps": [
    {
      "source": "RUNBOOK.md#rpc-spike",
      "command": "pnpm --filter @pirc/bridge rpc-spike -- 'hi'",
      "exitCode": 0,
      "expected": "reply printed to stdout",
      "actual": "reply printed to stdout",
      "result": "pass"
    }
  ],
  "checks": [{ "id": "O1", "result": "fail", "findings": ["F-001"] }],
  "findings": [
    {
      "id": "F-001",
      "check": "O1",
      "severity": "high",
      "title": "<one line>",
      "evidence": ["RUNBOOK.md:42", "$ pnpm x → exit 1: <relevant output>"],
      "expected": "<what the docs or rubric require>",
      "actual": "<what was observed>",
      "recommendation": "<what a fix must achieve, not how to code it>",
      "previous": null
    }
  ],
  "previousAudit": [{ "id": "F-003", "status": "resolved" }]
}
```

Field rules (enforced by `scripts/validate-findings.mjs`):

- `steps[].result`: `pass`, `fail`, or `not-executable` (with the reason in `actual`).
- `checks`: one entry for every check id in the rubric; `result` is `pass`, `fail`, or `n/a`. Every `fail` lists at least one finding id.
- `findings[].severity`: `critical`, `high`, `medium`, `low`, or `info`. `evidence` has at least one entry. `previous` is the id of the matching finding in the previous audit, or `null`.
- `previousAudit[].status`: `resolved`, `recurring`, or `not-rechecked`. Empty for audit 0.

## report.md

```markdown
# audit/N

Commit `<sha>` · <date> · <harness> / <model> · rubric v<k>

## Summary

<summary>

## Findings

| ID  | Severity | Check | Title |
| --- | -------- | ----- | ----- |

### F-001 · high · <title>

**Expected:** … **Actual:** … **Evidence:** … **Recommendation:** …

## Documented steps run

| Source | Command | Result |

## Checks

<one line per check: id, result, finding ids>

## Previous audit

<resolved / recurring / not re-checked, or "First audit.">
```
