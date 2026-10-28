import React from 'react';
import { Result, Button } from 'antd';
import { apiErrorMessage } from '../../lib/format';

export interface ErrorStateProps {
  error?: unknown;
  message?: string;
  onRetry?: () => void;
  card?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  error,
  message,
  onRetry,
  card = false,
  className,
  style,
}) => {
  const errorMessage = message ?? apiErrorMessage(error);

  const content = (
    <div
      role="alert"
      className={className}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
        width: '100%',
        ...style,
      }}
    >
      <Result
        status="error"
        title="Unable to load data"
        subTitle={<span style={{ color: 'var(--uc-text-2)' }}>{errorMessage}</span>}
        extra={
          onRetry && (
            <Button type="primary" onClick={onRetry}>
              Try Again
            </Button>
          )
        }
      />
    </div>
  );

  if (card) {
    return <div className="uc-section">{content}</div>;
  }

  return content;
};

export default ErrorState;
