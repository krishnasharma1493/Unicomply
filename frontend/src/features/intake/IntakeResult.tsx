import React from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, Card, Space, Typography } from 'antd';
import type { CaseIntakeResult, Meta } from '../../lib/api/types';
import { LinkedCaseCard, OverlapBanner, WhyFlagged } from '../../components/signature';
import { DECISION_LABELS } from './ResolutionPanel';

const { Text, Title } = Typography;

export interface IntakeResultProps {
  result: CaseIntakeResult;
  meta: Meta;
  onNewCase: () => void;
}

/** What the system did with the new case: its reference, the match decision, and any overlap (demo step 4). */
export const IntakeResult: React.FC<IntakeResultProps> = ({ result, meta, onNewCase }) => {
  const { case: created, resolution, overlaps } = result;
  const ownBureau = meta.bureaus.find((b) => b.id === created.current_bureau_id)?.code;
  return (
    <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
      <Alert
        type="success"
        showIcon
        title={<Text strong>Case registered: {created.case_ref}</Text>}
        description={
          <Space orientation="vertical" size={2}>
            <Text>{DECISION_LABELS[resolution.decision]}{created.institution_name ? ` — ${created.institution_name}` : ''}</Text>
            <Text type="secondary">Routed to {ownBureau ?? `bureau ${created.current_bureau_id}`}; due {created.sla_due_on}.</Text>
          </Space>
        }
        action={
          <Space>
            <Link to={`/cases/${created.id}`}>Open case</Link>
            <Button onClick={onNewCase}>Register another</Button>
          </Space>
        }
      />
      {overlaps.length === 0 ? (
        <Alert type="info" showIcon title="No overlapping cases found for this institution." />
      ) : (
        overlaps.map((group) => (
          <Card key={group.group_id} size="small">
            <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
              <OverlapBanner
                tier={group.tier}
                groupId={group.group_id}
                caseCount={group.cases.length + 1}
                bureauCodes={Array.from(new Set([...(ownBureau ? [ownBureau] : []), ...group.cases.map((c) => c.bureau_code)]))}
              />
              <div>
                <Title level={5}>Why this was flagged</Title>
                <WhyFlagged reasons={group.reasons} />
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                {group.cases.map((c) => (
                  <LinkedCaseCard key={c.case_id} card={c} />
                ))}
              </div>
            </Space>
          </Card>
        ))
      )}
    </Space>
  );
};
