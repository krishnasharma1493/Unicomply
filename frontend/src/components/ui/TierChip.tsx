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
  const color = isProbable ? 'red' : 'gold';
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
