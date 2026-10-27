import React from 'react';
import { Card, Typography, Space } from 'antd';

const { Text } = Typography;

export interface KpiCardProps {
  label: string;
  value: number | string;
  delta?: {
    value: number | string;
    isPositive?: boolean;
    label?: string;
  };
  icon?: React.ReactNode;
  onClick?: () => void;
  loading?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export const KpiCard: React.FC<KpiCardProps> = ({
  label,
  value,
  delta,
  icon,
  onClick,
  loading = false,
  className,
  style,
}) => {
  const isClickable = Boolean(onClick);

  return (
    <Card
      loading={loading}
      className={className}
      onClick={onClick}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={
        isClickable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      style={{
        borderRadius: '8px',
        cursor: isClickable ? 'pointer' : 'default',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        transition: 'all 0.2s ease-in-out',
        ...style,
      }}
      styles={{ body: { padding: '20px 24px' } }}
    >
      <Space orientation="vertical" size="small" style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text type="secondary" style={{ fontSize: '14px', fontWeight: 500 }}>
            {label}
          </Text>
          {icon && <span style={{ fontSize: '18px', color: '#64748b' }}>{icon}</span>}
        </div>

        <div style={{ fontSize: '28px', fontWeight: 700, color: '#0f172a', lineHeight: 1.2 }}>
          {value}
        </div>

        {delta && (
          <div style={{ fontSize: '12px', marginTop: '4px' }}>
            <span
              style={{
                color: delta.isPositive === false ? '#dc2626' : '#16a34a',
                fontWeight: 600,
                marginRight: '6px',
              }}
            >
              {delta.isPositive ? '▲' : delta.isPositive === false ? '▼' : ''} {delta.value}
            </span>
            {delta.label && <Text type="secondary">{delta.label}</Text>}
          </div>
        )}
      </Space>
    </Card>
  );
};

export default KpiCard;
