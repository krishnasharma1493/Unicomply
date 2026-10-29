import React from 'react';
import { Skeleton } from 'antd';

export interface LoadingStateProps {
  tip?: string;
  card?: boolean;
  minHeight?: number | string;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * A skeleton of the content that is coming, with the tip as a quiet caption. Skeletons keep the page
 * shape stable while data loads, so nothing jumps when it arrives.
 */
export const LoadingState: React.FC<LoadingStateProps> = ({
  tip = 'Loading...',
  card = false,
  minHeight = '200px',
  className,
  style,
}) => (
  <div
    role="status"
    aria-label={tip}
    className={[card ? 'uc-section uc-section-body' : '', 'uc-loading', className].filter(Boolean).join(' ')}
    style={{ minHeight, ...style }}
  >
    <Skeleton active title={{ width: '32%' }} paragraph={{ rows: 4, width: ['92%', '84%', '88%', '60%'] }} />
    <span className="uc-meta">{tip}</span>
  </div>
);

export default LoadingState;
