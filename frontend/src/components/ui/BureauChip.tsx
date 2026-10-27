import React from 'react';
import { Tag } from 'antd';
import { BUREAU_KIND_LABELS, type BureauKind } from '../../lib/api/enums';

export interface BureauChipProps {
  code: string;
  kind?: BureauKind;
  name?: string;
  showKind?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

const KIND_COLORS: Record<BureauKind, string> = {
  bureau: 'blue',
  cell: 'purple',
  regional_office: 'cyan',
};

export const BureauChip: React.FC<BureauChipProps> = ({
  code,
  kind,
  name,
  showKind = false,
  className,
  style,
}) => {
  // Determine kind if omitted: RO-* codes are regional offices
  const effectiveKind: BureauKind =
    kind ?? (code.startsWith('RO-') || code.startsWith('RO') ? 'regional_office' : 'bureau');

  const color = KIND_COLORS[effectiveKind] ?? 'blue';
  const kindLabel = BUREAU_KIND_LABELS[effectiveKind];

  const displayText = showKind && kindLabel ? `${code} · ${kindLabel}` : code;

  return (
    <Tag
      color={color}
      title={name ?? kindLabel}
      className={className}
      style={{ fontWeight: 500, ...style }}
    >
      {displayText}
    </Tag>
  );
};

export default BureauChip;
