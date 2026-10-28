import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Col, List, Row, Typography } from 'antd';
import { PageHeader } from '../components/layout/PageHeader';
import { QueryBoundary } from '../components/states';
import { ReviewWorkbench } from '../features/reviews/ReviewWorkbench';
import { usePendingReviews } from '../features/reviews/useReviews';
import type { ReviewDecideResult, ReviewItem } from '../lib/api/types';
import { formatDate } from '../lib/format';

const { Text } = Typography;

interface Done {
  kind: 'success' | 'warning';
  message: string;
  link?: { caseId: number; caseRef: string };
}

const Queue: React.FC<{ items: ReviewItem[]; done: Done | null; onDismiss: () => void; onDecided: (r: ReviewDecideResult, name: string | null) => void; onAlreadyDecided: (message: string) => void }> = ({
  items, done, onDismiss, onDecided, onAlreadyDecided,
}) => {
  const [selectedId, setSelectedId] = useState<number | null>(items[0]?.id ?? null);
  // The decided item leaves the queue: move to the next one.
  useEffect(() => {
    if (!items.some((r) => r.id === selectedId)) setSelectedId(items[0]?.id ?? null);
  }, [items, selectedId]);
  const selected = items.find((r) => r.id === selectedId);

  return (
    <>
      {done && (
        <Alert
          type={done.kind}
          showIcon
          closable
          onClose={onDismiss}
          style={{ marginBottom: 16 }}
          title={done.message}
          action={done.link && <Link to={`/cases/${done.link.caseId}`}>Open {done.link.caseRef}</Link>}
        />
      )}
      {items.length === 0 ? (
        <Alert type="success" showIcon title="The review queue is empty." description="Every uncertain match has been settled." />
      ) : (
        <Row gutter={[24, 24]}>
          <Col xs={24} lg={9} xl={8}>
            <section aria-label="Review queue">
            <List
              bordered
              dataSource={items}
              renderItem={(item) => (
                <List.Item
                  role="button"
                  tabIndex={0}
                  aria-label={`Review ${item.case_ref}`}
                  aria-current={item.id === selectedId}
                  onClick={() => setSelectedId(item.id)}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setSelectedId(item.id)}
                  className={item.id === selectedId ? 'uc-queue-item uc-queue-item--selected' : 'uc-queue-item'}
                >
                  <List.Item.Meta
                    title={item.raw_institution_text}
                    description={
                      <>
                        <Text type="secondary">{item.case_ref} · {formatDate(item.received_at)}</Text>
                        <br />
                        <Text type="secondary">{[item.raw_district, item.raw_state].filter(Boolean).join(', ') || 'No location'}</Text>
                      </>
                    }
                  />
                </List.Item>
              )}
            />
            </section>
          </Col>
          <Col xs={24} lg={15} xl={16}>
            {selected && (
              <ReviewWorkbench
                key={selected.id}
                review={selected}
                onDecided={(result, choice) => onDecided(result, choice?.name ?? null)}
                onAlreadyDecided={onAlreadyDecided}
              />
            )}
          </Col>
        </Row>
      )}
    </>
  );
};

export const MatchReviewPage: React.FC = () => {
  const reviews = usePendingReviews();
  const [done, setDone] = useState<Done | null>(null);
  return (
    <div className="uc-page">
      <PageHeader
        title="Match Review"
        subtitle="Complaints whose institution the system could not match with confidence. Your choice is remembered: the same spelling resolves automatically next time."
      />
      <QueryBoundary query={reviews} loadingTip="Loading the review queue" isEmpty={() => false}>
        {(page) => (
          <Queue
            items={page.data}
            done={done}
            onDismiss={() => setDone(null)}
            onAlreadyDecided={(message) => setDone({ kind: 'warning', message })}
            onDecided={(result, name) =>
              setDone({
                kind: 'success',
                link: { caseId: result.case.id, caseRef: result.case.case_ref },
                message: name
                  ? `${result.case.case_ref} is now linked to ${name}.${result.overlaps.length ? ` ${result.overlaps.length === 1 ? 'An overlap was' : 'Overlaps were'} found.` : ''}`
                  : `${result.case.case_ref} was marked as not in the registry.`,
              })
            }
          />
        )}
      </QueryBoundary>
    </div>
  );
};

export default MatchReviewPage;
