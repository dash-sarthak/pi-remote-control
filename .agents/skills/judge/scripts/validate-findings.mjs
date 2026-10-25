#!/usr/bin/env node
/**
 * Validates an audit's `findings.json` against references/report-format.md
 * and the check ids in references/rubric.md.
 *
 * Usage: `node validate-findings.mjs audit/N/findings.json`
 * Prints one problem per line to stderr and exits 1 when invalid; exits 0 silently when valid.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'];
const STEP_RESULTS = ['pass', 'fail', 'not-executable'];
const CHECK_RESULTS = ['pass', 'fail', 'n/a'];
const PREVIOUS_STATUSES = ['resolved', 'recurring', 'not-rechecked'];

/**
 * Reads the check ids (`O1`, `TL4`, …) and the rubric version from rubric.md.
 *
 * @param {string} rubricMarkdown
 * @returns {{ version: number, checkIds: string[] }}
 */
export function parseRubric(rubricMarkdown) {
  const version = Number(/Rubric version: \*\*(\d+)\*\*/.exec(rubricMarkdown)?.[1] ?? Number.NaN);
  const checkIds = [...rubricMarkdown.matchAll(/^- ([A-Z]+\d+)\. /gm)].map(
    (match) => match[1] ?? '',
  );
  return { version, checkIds };
}

/**
 * Returns every way `report` violates the report format, in a stable order; empty when valid.
 *
 * @param {unknown} report - Parsed findings.json.
 * @param {{ version: number, checkIds: readonly string[] }} rubric
 * @returns {string[]}
 */
export function validateFindings(report, rubric) {
  const problems = [];
  if (!isObject(report)) return ['findings.json must contain a JSON object'];

  if (!Number.isInteger(report['audit']) || /** @type {number} */ (report['audit']) < 0)
    problems.push('audit must be a non-negative integer');
  if (report['rubricVersion'] !== rubric.version)
    problems.push(`rubricVersion must be ${rubric.version}`);
  if (typeof report['date'] !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(report['date']))
    problems.push('date must be YYYY-MM-DD');
  if (typeof report['commit'] !== 'string' || !/^[0-9a-f]{40}$/.test(report['commit']))
    problems.push('commit must be a full 40-character SHA');
  if (report['harness'] !== 'claude-code' && report['harness'] !== 'pi')
    problems.push('harness must be "claude-code" or "pi"');
  for (const field of ['model', 'summary']) {
    if (typeof report[field] !== 'string' || report[field].length === 0)
      problems.push(`${field} must be a non-empty string`);
  }

  const steps = arrayField(report, 'steps', problems);
  steps.forEach((step, index) => {
    const where = `steps[${index}]`;
    if (!isObject(step)) return problems.push(`${where} must be an object`);
    for (const field of ['source', 'command', 'expected', 'actual']) {
      if (typeof step[field] !== 'string' || step[field].length === 0)
        problems.push(`${where}.${field} must be a non-empty string`);
    }
    if (!STEP_RESULTS.includes(String(step['result'])))
      problems.push(`${where}.result must be one of ${STEP_RESULTS.join(', ')}`);
  });

  const findings = arrayField(report, 'findings', problems);
  const findingIds = new Set();
  findings.forEach((finding, index) => {
    const where = `findings[${index}]`;
    if (!isObject(finding)) return problems.push(`${where} must be an object`);
    if (typeof finding['id'] !== 'string' || !/^F-\d{3}$/.test(finding['id']))
      problems.push(`${where}.id must look like F-001`);
    else if (findingIds.has(finding['id']))
      problems.push(`${where}.id ${finding['id']} is duplicated`);
    else findingIds.add(finding['id']);
    if (!rubric.checkIds.includes(String(finding['check'])))
      problems.push(`${where}.check must be a rubric check id`);
    if (!SEVERITIES.includes(String(finding['severity'])))
      problems.push(`${where}.severity must be one of ${SEVERITIES.join(', ')}`);
    for (const field of ['title', 'expected', 'actual', 'recommendation']) {
      if (typeof finding[field] !== 'string' || finding[field].length === 0)
        problems.push(`${where}.${field} must be a non-empty string`);
    }
    const evidence = finding['evidence'];
    if (
      !Array.isArray(evidence) ||
      evidence.length === 0 ||
      !evidence.every((item) => typeof item === 'string' && item.length > 0)
    ) {
      problems.push(`${where}.evidence must list at least one non-empty string`);
    }
    if (
      finding['previous'] !== null &&
      (typeof finding['previous'] !== 'string' || !/^F-\d{3}$/.test(finding['previous']))
    ) {
      problems.push(`${where}.previous must be a finding id or null`);
    }
  });

  const checks = arrayField(report, 'checks', problems);
  const answered = new Set();
  checks.forEach((check, index) => {
    const where = `checks[${index}]`;
    if (!isObject(check)) return problems.push(`${where} must be an object`);
    answered.add(check['id']);
    if (!CHECK_RESULTS.includes(String(check['result'])))
      problems.push(`${where}.result must be one of ${CHECK_RESULTS.join(', ')}`);
    const linked = Array.isArray(check['findings']) ? check['findings'] : [];
    if (check['result'] === 'fail' && linked.length === 0)
      problems.push(`${where} failed but lists no findings`);
    for (const id of linked) {
      if (!findingIds.has(id)) problems.push(`${where} links unknown finding ${String(id)}`);
    }
  });
  for (const id of rubric.checkIds) {
    if (!answered.has(id)) problems.push(`checks is missing rubric check ${id}`);
  }

  arrayField(report, 'previousAudit', problems).forEach((entry, index) => {
    const where = `previousAudit[${index}]`;
    if (
      !isObject(entry) ||
      typeof entry['id'] !== 'string' ||
      !PREVIOUS_STATUSES.includes(String(entry['status']))
    ) {
      problems.push(`${where} must have an id and a status of ${PREVIOUS_STATUSES.join(', ')}`);
    }
  });
  return problems;
}

/**
 * @param {Record<string, unknown>} report
 * @param {string} field
 * @param {string[]} problems - Receives a problem when the field is not an array.
 * @returns {unknown[]}
 */
function arrayField(report, field, problems) {
  const value = report[field];
  if (Array.isArray(value)) return value;
  problems.push(`${field} must be an array`);
  return [];
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const path = process.argv[2];
  if (path === undefined) {
    process.stderr.write('usage: validate-findings.mjs <findings.json>\n');
    process.exit(2);
  }
  const rubric = parseRubric(
    readFileSync(new URL('../references/rubric.md', import.meta.url), 'utf8'),
  );
  let report;
  try {
    report = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    process.stderr.write(`${path}: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
  const problems = validateFindings(report, rubric);
  for (const problem of problems) process.stderr.write(`${problem}\n`);
  process.exit(problems.length === 0 ? 0 : 1);
}
