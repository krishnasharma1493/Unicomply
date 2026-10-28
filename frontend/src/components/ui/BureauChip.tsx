import React from 'react';
import { BUREAU_KIND_LABELS, type BureauKind } from '../../lib/api/enums';

export interface BureauChipProps {
  code: string;
  kind?: BureauKind;
  name?: string;
  showKind?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

/** A bureau or Regional Office code as a neutral label; the full name is in the tooltip. */
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
  const kindLabel = BUREAU_KIND_LABELS[effectiveKind];
  const displayText = showKind && kindLabel ? `${code} · ${kindLabel}` : code;

  return (
    <span title={name ?? kindLabel} className={['uc-label', className].filter(Boolean).join(' ')} style={style}>
      {displayText}
    </span>
  );
};

export default BureauChip;
