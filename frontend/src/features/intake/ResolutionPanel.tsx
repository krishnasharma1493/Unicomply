import React from 'react';
import { Alert, Button, Card, Spin, Typography } from 'antd';
import type { Candidate, Resolution } from '../../lib/api/types';
import { CandidateList } from '../../components/signature';
import { ErrorState } from '../../components/states';
import { apiErrorMessage } from '../../lib/format';

const { Text } = Typography;

export const DECISION_LABELS: Record<Resolution['decision'], string> = {
  auto: 'Matched automatically',
  pending_review: 'Likely match, but it will be queued for review',
  unresolved: 'No confident match: it will be queued for review',
  provided: 'Permanent ID entered by the operator',
};

export interface ResolutionPanelProps {
  tooShort: boolean;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  resolution?: Resolution;
  selectedId: string | null;
  onSelect: (candidate: Candidate) => void;
  onClear: () => void;
}

/** The live candidate panel beside the form (demo step 3): top-3 institutions with reasons. */
export const ResolutionPanel: React.FC<ResolutionPanelProps> = ({
  tooShort, loading, error, onRetry, resolution, selectedId, onSelect, onClear,
}) => (
  <Card title="Institution match" size="small" aria-live="polite">
    {selectedId && (
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 12 }}
        title={`Permanent ID ${selectedId} will be used`}
        action={<Button size="small" onClick={onClear}>Clear</Button>}
      />
    )}
    {tooShort ? (
      <Text type="secondary">Type the institution name as written in the complaint to see matching institutions.</Text>
    ) : error ? (
      <ErrorState message={apiErrorMessage(error)} onRetry={onRetry} style={{ padding: 0 }} />
    ) : loading || !resolution ? (
      <div role="status" aria-label="Looking up institutions" style={{ textAlign: 'center', padding: 24 }}>
        <Spin />
      </div>
    ) : (
      <>
        <Alert type={resolution.decision === 'auto' ? 'success' : 'warning'} showIcon style={{ marginBottom: 12 }} title={DECISION_LABELS[resolution.decision]} />
        <CandidateList candidates={resolution.candidates} selectedId={selectedId} onSelect={onSelect} />
      </>
    )}
  </Card>
);
