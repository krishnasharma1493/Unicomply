import React from 'react';
import { Empty, Typography } from 'antd';

const { Text } = Typography;

export interface EmptyStateProps {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  card?: boolean;
  minHeight?: number | string;
  className?: string;
  style?: React.CSSProperties;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description = 'No records found',
  action,
  card = false,
  minHeight = '200px',
  className,
  style,
}) => {
  const content = (
    <div
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight,
        padding: '32px 16px',
        width: '100%',
        ...style,
      }}
    >
      <Empty
        description={
          <div>
            {title && (
              <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--uc-text)', marginBottom: 4 }}>
                {title}
              </div>
            )}
            <Text type="secondary" style={{ fontSize: '14px' }}>
              {description}
            </Text>
          </div>
        }
      >
        {action}
      </Empty>
    </div>
  );

  if (card) {
    return <div className="uc-section">{content}</div>;
  }

  return content;
};

export default EmptyState;
