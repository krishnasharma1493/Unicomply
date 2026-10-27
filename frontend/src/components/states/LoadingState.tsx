import React from 'react';
import { Spin, Card } from 'antd';

export interface LoadingStateProps {
  tip?: string;
  card?: boolean;
  minHeight?: number | string;
  className?: string;
  style?: React.CSSProperties;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  tip = 'Loading...',
  card = false,
  minHeight = '200px',
  className,
  style,
}) => {
  const content = (
    <div
      role="status"
      aria-label={tip}
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight,
        gap: '12px',
        width: '100%',
        ...style,
      }}
    >
      <Spin size="large" />
      <span style={{ color: '#64748b', fontSize: '14px', fontWeight: 500 }}>{tip}</span>
    </div>
  );

  if (card) {
    return <Card styles={{ body: { padding: 0 } }}>{content}</Card>;
  }

  return content;
};

export default LoadingState;
