import React from 'react';
import { Link } from 'react-router-dom';
import { Descriptions } from 'antd';
import { SOURCE_CHANNEL_LABELS, COMPLAINANT_TYPE_LABELS } from '../../lib/api/enums';
import type { CaseDetail, Meta } from '../../lib/api/types';
import { formatDate } from '../../lib/format';

/** Every tracking field of PRD §4.1 (the PS's "Complaint / Case Tracking" list). */
export const TrackingFields: React.FC<{ detail: CaseDetail; meta: Meta }> = ({ detail, meta }) => {
  const { case: c, institution } = detail;
  const category = meta.categories.find((k) => k.id === c.category_id);
  const bureau = meta.bureaus.find((b) => b.id === c.current_bureau_id);
  const officer = meta.officers.find((o) => o.id === c.assigned_officer_id);
  return (
    <Descriptions className="uc-fields" layout="vertical" size="small" colon={false} column={{ xs: 1, md: 2 }}>
      <Descriptions.Item label="Source">{SOURCE_CHANNEL_LABELS[c.source_channel]}</Descriptions.Item>
      <Descriptions.Item label="External reference">{c.external_ref ?? '—'}</Descriptions.Item>
      <Descriptions.Item label="Received">{formatDate(c.received_at)}</Descriptions.Item>
      <Descriptions.Item label="SLA due">{formatDate(c.sla_due_on)}</Descriptions.Item>
      <Descriptions.Item label="Complainant">
        {COMPLAINANT_TYPE_LABELS[c.complainant_type]}
        {c.complainant_name ? `: ${c.complainant_name}` : ''}
      </Descriptions.Item>
      <Descriptions.Item label="Category">{category?.name ?? c.category_id}</Descriptions.Item>
      <Descriptions.Item label="Institution (as written)">
        {c.raw_institution_text}
        {c.raw_district || c.raw_state ? ` (${[c.raw_district, c.raw_state].filter(Boolean).join(', ')})` : ''}
      </Descriptions.Item>
      <Descriptions.Item label="Institution (resolved)">
        <span>
        {institution ? (
          <Link to={`/institutions/${institution.permanent_id}`}>{institution.name}</Link>
        ) : (
          'Not resolved yet'
        )}
        {c.match_score !== null && ` · match ${c.match_status}`}
        </span>
      </Descriptions.Item>
      <Descriptions.Item label="Permanent ID">{c.permanent_id ?? '—'}</Descriptions.Item>
      <Descriptions.Item label="Trust">{institution?.trust_name ?? '—'}</Descriptions.Item>
      <Descriptions.Item label="Current bureau">{bureau ? `${bureau.code} — ${bureau.name}` : c.current_bureau_id}</Descriptions.Item>
      <Descriptions.Item label="Assigned officer">{officer?.name ?? 'Not assigned'}</Descriptions.Item>
      <Descriptions.Item label="Next action">{c.next_action ?? '—'}</Descriptions.Item>
      <Descriptions.Item label="Expected disposal">{c.expected_disposal_date ? formatDate(c.expected_disposal_date) : '—'}</Descriptions.Item>
      <Descriptions.Item label="Escalation level">{c.escalation_level}</Descriptions.Item>
      <Descriptions.Item label="Reopened">{c.reopen_count} {c.reopen_count === 1 ? 'time' : 'times'}</Descriptions.Item>
      <Descriptions.Item label="Subject" span="filled">{c.subject}</Descriptions.Item>
      <Descriptions.Item label="Description" span="filled">
        <div style={{ whiteSpace: 'pre-wrap', maxWidth: '72ch' }}>{c.description}</div>
      </Descriptions.Item>
    </Descriptions>
  );
};
