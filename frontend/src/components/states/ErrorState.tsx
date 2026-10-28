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
  const status = (error as { response?: { status?: number } } | undefined)?.response?.status;
  // Retrying cannot change a scope or role decision, so those errors get guidance instead of a retry.
  const final = status === 401 || status === 403 || status === 404;
  const guidance =
    status === 403
      ? 'Your role does not include this. Use the navigation for the work your role covers.'
      : status === 404
        ? 'It may not exist, or it belongs to a bureau or region outside your scope. Linked cases from other units appear as summaries inside overlap groups.'
        : null;

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
        subTitle={
          <span style={{ color: 'var(--uc-text-2)', display: 'block', maxWidth: '60ch', margin: '0 auto' }}>
            {errorMessage}
            {guidance && <span style={{ display: 'block', marginTop: 6 }}>{guidance}</span>}
          </span>
        }
        extra={
          onRetry && !final && (
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
