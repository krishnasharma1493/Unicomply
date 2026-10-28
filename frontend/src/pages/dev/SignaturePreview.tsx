import React, { useState } from 'react';
import { Card, Space, Typography } from 'antd';
import { fixtures } from '../../lib/api/mock/fixtures';
import { CandidateList, LinkedCaseCard, OverlapBanner, WhyFlagged } from '../../components/signature';

const { Title } = Typography;

/** Dev-only: each signature component rendered from the shared hero fixtures (#2). */
export const SignaturePreview: React.FC = () => {
  const intake = fixtures.intake.data;
  const group = intake.overlaps[0];
  const [selected, setSelected] = useState<string | null>(intake.resolution.candidates[0]?.permanent_id ?? null);
  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: 24 }}>
      <Space orientation="vertical" size="large" style={{ width: '100%' }}>
        <Title level={2}>Signature components</Title>
        <Card title="OverlapBanner — probable">
          <OverlapBanner
            tier={group.tier}
            bureauCodes={Array.from(new Set(group.cases.map((c) => c.bureau_code)))}
            caseCount={group.cases.length + 1}
            groupId={group.group_id}
          />
        </Card>
        <Card title="OverlapBanner — possible">
          <OverlapBanner tier="possible" bureauCodes={['PGRC', 'RB']} caseCount={2} />
        </Card>
        <Card title="WhyFlagged">
          <WhyFlagged reasons={group.reasons} score={0.81} scoreLabel="Description similarity" />
        </Card>
        <Card title="CandidateList">
          <CandidateList
            candidates={intake.resolution.candidates}
            selectedId={selected}
            onSelect={(c) => setSelected(c.permanent_id)}
          />
        </Card>
        <Card title="LinkedCaseCard">
          <Space orientation="vertical" style={{ width: '100%' }}>
            {group.cases.map((c) => (
              <LinkedCaseCard key={c.case_id} card={c} />
            ))}
          </Space>
        </Card>
      </Space>
    </div>
  );
};

export default SignaturePreview;
