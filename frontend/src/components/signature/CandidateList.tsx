import React from 'react';
import { Button, Card, Tag, Typography } from 'antd';
import { CheckCircleFilled } from '@ant-design/icons';
import type { Candidate } from '../../lib/api/types';
import { EmptyState } from '../states';
import { WhyFlagged } from './WhyFlagged';

const { Text } = Typography;

export interface CandidateListProps {
  candidates: Candidate[];
  /** Permanent ID of the chosen candidate. */
  selectedId?: string | null;
  onSelect?: (candidate: Candidate) => void;
  emptyText?: string;
}

/** Ranked institution candidates with their reasons (PRD §4.4, §7). Rank 1 is the best match. */
export const CandidateList: React.FC<CandidateListProps> = ({
  candidates,
  selectedId = null,
  onSelect,
  emptyText = 'No matching institution in the registry.',
}) => {
  if (candidates.length === 0) return <EmptyState description={emptyText} minHeight={80} />;
  return (
    <div role="list" aria-label="Candidate institutions" style={{ display: 'grid', gap: 12 }}>
      {candidates.map((c, index) => {
        const selected = c.permanent_id === selectedId;
        return (
          <Card
            key={c.permanent_id}
            role="listitem"
            aria-label={`Candidate ${c.name}`}
            size="small"
            style={{ borderColor: selected ? '#1e3a8a' : undefined }}
            title={
              <span>
                <Text type="secondary">#{index + 1} </Text>
                {c.name}
                {selected && (
                  <Tag icon={<CheckCircleFilled />} color="blue" style={{ marginLeft: 8 }}>
                    Selected
                  </Tag>
                )}
              </span>
            }
            extra={
              onSelect && (
                <Button
                  size="small"
                  type={selected ? 'primary' : 'default'}
                  aria-pressed={selected}
                  aria-label={`Select ${c.name}`}
                  onClick={() => onSelect(c)}
                >
                  {selected ? 'Selected' : 'Select'}
                </Button>
              )
            }
          >
            <Text type="secondary">
              {c.permanent_id} · {c.district}, {c.state}
            </Text>
            <div style={{ marginTop: 8 }}>
              <WhyFlagged reasons={c.reasons} score={c.score} />
            </div>
          </Card>
        );
      })}
    </div>
  );
};

export default CandidateList;
