import React from 'react';
import { Tag } from 'antd';
import { OVERLAP_TIER_LABELS, type OverlapTier } from '../../lib/api/enums';

export interface TierChipProps {
  tier: OverlapTier;
  className?: string;
  style?: React.CSSProperties;
}

export const TierChip: React.FC<TierChipProps> = ({ tier, className, style }) => {
  const isProbable = tier === 'probable';
  // Preset 'error'/'warning' tags are restyled to AA-contrast tints in index.css.
  const color = isProbable ? 'error' : 'warning';
  const label = OVERLAP_TIER_LABELS[tier] ?? tier;

  return (
    <Tag
      color={color}
      className={className}
      style={{
        fontWeight: 600,
        textTransform: 'capitalize',
        ...style,
      }}
    >
      {label}
    </Tag>
  );
};

export default TierChip;
