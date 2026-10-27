import { describe, it, expect } from 'vitest';
import {
  ACTION_TYPES,
  AGEING_BUCKETS,
  ALERT_SEVERITIES,
  ALERT_TYPES,
  ALIAS_SOURCES,
  API_ERROR_CODES,
  BUREAU_KINDS,
  CASE_STATUSES,
  CATEGORY_CODES,
  COMPLAINANT_TYPES,
  DISPOSE_OUTCOMES,
  INST_TYPES,
  MATCH_STATUSES,
  OVERLAP_DECISIONS,
  OVERLAP_GROUP_STATUSES,
  OVERLAP_LEVELS,
  OVERLAP_TIERS,
  PAIR_DECISIONS,
  REGIONS,
  REPORT_KINDS,
  RESOLUTION_DECISIONS,
  REVIEW_STATUSES,
  ROLES,
  SOURCE_CHANNELS,
} from '../lib/api/enums';
import { fixtures } from '../lib/api/mock/fixtures';

// `satisfies` in mock/fixtures.ts checks fixture *shapes* at compile time; JSON imports widen
// enum values to `string`, so this checks the values against the #3 enums at test time.

type Node = Record<string, unknown>;
type Rule = { when: (o: Node) => boolean; key: string; allowed: readonly (string | null)[]; hits: number };

const always = () => true;
const has =
  (...keys: string[]) =>
  (o: Node) =>
    keys.every((k) => k in o);
const rule = (key: string, allowed: readonly (string | null)[], when: (o: Node) => boolean = always): Rule => ({
  when,
  key,
  allowed,
  hits: 0,
});

const rules: Rule[] = [
  rule('action_type', ACTION_TYPES),
  rule('last_action_type', [...ACTION_TYPES, null]),
  rule('source_channel', SOURCE_CHANNELS),
  rule('complainant_type', COMPLAINANT_TYPES),
  rule('match_status', MATCH_STATUSES),
  rule('outcome', [...DISPOSE_OUTCOMES, null]),
  rule('inst_type', INST_TYPES),
  rule('severity', ALERT_SEVERITIES),
  rule('category_code', CATEGORY_CODES),
  rule('role', ROLES),
  rule('region', [...REGIONS, null]),
  rule('tier', OVERLAP_TIERS),
  rule('level', OVERLAP_LEVELS),
  rule('bucket', AGEING_BUCKETS),
  rule('source', ALIAS_SOURCES),
  rule('status', CASE_STATUSES, has('source_channel')),
  rule('status', CASE_STATUSES, has('in_scope')),
  rule('status', CASE_STATUSES, has('status_name')),
  rule('status', OVERLAP_GROUP_STATUSES, has('anchor_key')),
  rule('status', OVERLAP_GROUP_STATUSES, has('banner', 'group_id')),
  rule('status', OVERLAP_GROUP_STATUSES, has('groups', 'tier')),
  rule('status', REVIEW_STATUSES, has('candidates', 'case_id')),
  rule('decision', RESOLUTION_DECISIONS, has('candidates', 'decision')),
  rule('decision', PAIR_DECISIONS, has('case_a_id')),
  rule('decision', OVERLAP_DECISIONS, has('decision', 'remark')),
  rule('type', ALERT_TYPES, has('dedupe_key')),
  rule('kind', REPORT_KINDS, has('columns')),
  rule('kind', BUREAU_KINDS, (o) => 'kind' in o && !('columns' in o)),
  rule('code', CATEGORY_CODES, has('default_sla_days')),
  rule('code', API_ERROR_CODES, has('code', 'message')),
];

function walk(value: unknown, path: string, problems: string[]) {
  if (Array.isArray(value)) {
    value.forEach((v, i) => walk(v, `${path}[${i}]`, problems));
    return;
  }
  if (typeof value !== 'object' || value === null) return;
  const node = value as Node;
  for (const r of rules) {
    if (!(r.key in node) || !r.when(node)) continue;
    r.hits += 1;
    const v = node[r.key];
    if (!r.allowed.includes(v as string | null)) problems.push(`${path}.${r.key} = ${JSON.stringify(v)}`);
  }
  for (const [k, v] of Object.entries(node)) walk(v, `${path}.${k}`, problems);
}

describe('Contract fixtures vs TS enums', () => {
  it('uses only enum values the #3 types allow', () => {
    const problems: string[] = [];
    // `login`, `reports`, … are maps of fixtures keyed by persona or kind; walk each fixture.
    for (const [name, value] of Object.entries(fixtures)) {
      const isMap = ['login', 'usersMe', 'reports', 'errors', 'requests'].includes(name);
      const docs: [string, unknown][] = isMap ? Object.entries(value) : [['', value]];
      for (const [key, doc] of docs) walk(doc, key ? `${name}.${key}` : name, problems);
    }
    expect(problems).toEqual([]);
    // Every rule must have checked something, or it is silently dead.
    expect(rules.filter((r) => r.hits === 0).map((r) => `${r.key} (${r.allowed.join('|')})`)).toEqual([]);
  });

  it('lists exactly the enum codes in /meta', () => {
    const meta = fixtures.meta.data;
    const codes = (xs: { code: string }[]) => xs.map((x) => x.code).sort();
    const sorted = (xs: readonly string[]) => [...xs].sort();
    expect(codes(meta.statuses)).toEqual(sorted(CASE_STATUSES));
    expect(codes(meta.channels)).toEqual(sorted(SOURCE_CHANNELS));
    expect(codes(meta.action_types)).toEqual(sorted(ACTION_TYPES));
    expect(codes(meta.complainant_types)).toEqual(sorted(COMPLAINANT_TYPES));
    expect(codes(meta.dispose_outcomes)).toEqual(sorted(DISPOSE_OUTCOMES));
    expect(codes(meta.inst_types)).toEqual(sorted(INST_TYPES));
    expect(codes(meta.regions)).toEqual(sorted(REGIONS));
    expect(codes(meta.categories)).toEqual(sorted(CATEGORY_CODES));
  });
});
