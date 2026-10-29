import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert } from 'antd';
import { AnimatePresence, motion } from 'motion/react';
import { PageHeader } from '../components/layout/PageHeader';
import { QueryBoundary } from '../components/states';
import { ReviewWorkbench } from '../features/reviews/ReviewWorkbench';
import { usePendingReviews } from '../features/reviews/useReviews';
import type { ReviewDecideResult, ReviewItem } from '../lib/api/types';
import { formatDate } from '../lib/format';
import { useMotionPrefs } from '../lib/motion';
import '../styles/reviews.css';

interface Done {
  kind: 'success' | 'warning';
  message: string;
  link?: { caseId: number; caseRef: string };
}

/**
 * The pending reviews, oldest first. Each row is a real button; the open one is marked current.
 * Up and Down move through the queue. A decided item leaves with a layout spring and the rows below
 * close the gap, so the eye follows the queue rather than a redraw.
 */
const QueueList: React.FC<{ items: ReviewItem[]; selectedId: number | null; onSelect: (id: number) => void }> = ({
  items, selectedId, onSelect,
}) => {
  const motionPrefs = useMotionPrefs();
  const list = useRef<HTMLUListElement>(null);
  const move = (from: number, by: number) => {
    const next = items[Math.min(items.length - 1, Math.max(0, from + by))];
    if (!next) return;
    onSelect(next.id);
    list.current?.querySelector<HTMLButtonElement>(`[data-review="${next.id}"]`)?.focus();
  };
  return (
    <ul className="uc-review-queue" ref={list}>
      <AnimatePresence initial={false}>
        {items.map((item, index) => {
          const selected = item.id === selectedId;
          const where = [item.raw_district, item.raw_state].filter(Boolean).join(', ') || 'No location';
          return (
            <motion.li
              key={item.id}
              layout={motionPrefs.reduce ? false : 'position'}
              initial={false}
              animate={{ opacity: 1 }}
              exit={motionPrefs.reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97 }}
              transition={motionPrefs.spring}
            >
              <button
                type="button"
                data-review={item.id}
                className={selected ? 'uc-review-item is-selected' : 'uc-review-item'}
                aria-label={`Review ${item.case_ref}`}
                aria-describedby={`review-item-${item.id}`}
                aria-current={selected ? 'true' : undefined}
                onClick={() => onSelect(item.id)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    move(index, e.key === 'ArrowDown' ? 1 : -1);
                  }
                }}
              >
                <span className="uc-review-item-raw" id={`review-item-${item.id}`}>{item.raw_institution_text}</span>
                <span className="uc-meta">
                  <span className="uc-ref">{item.case_ref}</span> · {formatDate(item.received_at)}
                </span>
                <span className="uc-meta">{where}</span>
              </button>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ul>
  );
};

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
        <div className="uc-review-split">
          <section className="uc-section uc-review-queue-pane" aria-labelledby="review-queue-title">
            <div className="uc-section-head">
              <h2 className="uc-section-title" id="review-queue-title">Review queue</h2>
              <span className="uc-meta uc-num">{items.length} pending</span>
            </div>
            <QueueList items={items} selectedId={selectedId} onSelect={setSelectedId} />
          </section>
          <div className="uc-review-work-pane">
            {selected && (
              <ReviewWorkbench
                key={selected.id}
                review={selected}
                onDecided={(result, choice) => onDecided(result, choice?.name ?? null)}
                onAlreadyDecided={onAlreadyDecided}
              />
            )}
          </div>
        </div>
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
