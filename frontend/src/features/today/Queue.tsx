import React, { useId } from 'react';
import { Link } from 'react-router-dom';
import { Skeleton } from 'antd';
import { ErrorState } from '../../components/states';

export interface QueueProps {
  title: string;
  /** Shown beside the title when there is something to count. */
  count?: number;
  /** A word or two after the count, e.g. "of 52". */
  countNote?: string;
  seeAll?: { to: string; label: string };
  isLoading: boolean;
  isError: boolean;
  error?: unknown;
  onRetry?: () => void;
  isEmpty: boolean;
  /** What is clear, in words: "Nothing past SLA in your scope." */
  emptyText: string;
  loadingLabel: string;
  rows?: number;
  children?: React.ReactNode;
  className?: string;
}

/**
 * One part of Today: a heading with its count, then rows, or a skeleton of them, or what is clear,
 * or the error with a retry. Each part stands alone, so one failing request never blanks the page.
 */
export const Queue: React.FC<QueueProps> = ({
  title, count, countNote, seeAll, isLoading, isError, error, onRetry, isEmpty, emptyText, loadingLabel, rows = 3, children, className,
}) => {
  const id = useId();
  return (
    <section className={['uc-section', 'uc-queue', className].filter(Boolean).join(' ')} aria-labelledby={id}>
      <div className="uc-queue-head">
        <h2 id={id} className="uc-queue-title">
          {title}
          {!isLoading && !isError && count !== undefined && count > 0 && (
            <span className="uc-queue-count">
              {count}
              {countNote && <span className="uc-queue-note"> {countNote}</span>}
            </span>
          )}
        </h2>
        {seeAll && (
          <Link to={seeAll.to} className="uc-queue-all" aria-label={seeAll.label}>
            See all
          </Link>
        )}
      </div>
      <div className="uc-queue-body">
        {isLoading ? (
          <div role="status" aria-label={loadingLabel} className="uc-queue-skeleton">
            {Array.from({ length: rows }, (_, i) => (
              <Skeleton key={i} active title={false} paragraph={{ rows: 2, width: ['42%', '78%'] }} />
            ))}
          </div>
        ) : isError ? (
          <ErrorState error={error} onRetry={onRetry} style={{ padding: '8px 0' }} />
        ) : isEmpty ? (
          <p className="uc-queue-empty">{emptyText}</p>
        ) : (
          children
        )}
      </div>
    </section>
  );
};
