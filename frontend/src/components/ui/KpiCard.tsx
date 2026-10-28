import React from 'react';
import { Skeleton } from 'antd';

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

/**
 * One figure in a KPI strip: the label above, the number below in tabular figures. It carries no box
 * of its own; the strip around it provides the surface and the hairlines.
 */
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
    <div
      className={['uc-kpi', isClickable ? 'uc-kpi--link uc-pressable' : '', className].filter(Boolean).join(' ')}
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
      style={style}
    >
      <div className="uc-kpi-label">
        <span>{label}</span>
        {icon && <span aria-hidden="true">{icon}</span>}
      </div>
      {loading ? (
        <Skeleton.Input active size="small" style={{ width: 64, minWidth: 64, marginTop: 6 }} />
      ) : (
        <div className="uc-kpi-value uc-num">{value}</div>
      )}
      {delta && (
        <div className="uc-kpi-delta">
          <span style={{ color: delta.isPositive === false ? 'var(--uc-red)' : 'var(--uc-green)', fontWeight: 600 }}>
            {delta.isPositive ? '▲' : delta.isPositive === false ? '▼' : ''} {delta.value}
          </span>
          {delta.label && <span className="uc-muted">{delta.label}</span>}
        </div>
      )}
    </div>
  );
};

export default KpiCard;
