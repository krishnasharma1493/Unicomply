import React from 'react';
import { Link } from 'react-router-dom';
import { Alert, Space, Typography } from 'antd';
import { OVERLAP_BANNERS, type OverlapTier } from '../../lib/api/enums';
import { BureauChip } from '../ui';

const { Text } = Typography;

export interface OverlapBannerProps {
  tier: OverlapTier;
  /** Codes of the bureaus / Regional Offices involved, e.g. ['PGRC', 'RB', 'RO-CRO']. */
  bureauCodes: string[];
  caseCount: number;
  /** When given, the banner links to the overlap detail page. */
  groupId?: number;
}

/**
 * The signature alert (PRD §4.5, §7): red "Probable" with the PS's exact wording, amber "Possible".
 * The tier is always written out, never colour alone.
 */
export const OverlapBanner: React.FC<OverlapBannerProps> = ({ tier, bureauCodes, caseCount, groupId }) => (
  <Alert
    type={tier === 'probable' ? 'error' : 'warning'}
    showIcon
    role="alert"
    title={<Text strong>{OVERLAP_BANNERS[tier]}</Text>}
    description={
      <Space wrap size={[8, 4]} align="center">
        <Text>
          {caseCount} {caseCount === 1 ? 'case' : 'cases'} handled by
        </Text>
        {bureauCodes.map((code) => (
          <BureauChip key={code} code={code} />
        ))}
        {groupId !== undefined && <Link to={`/overlaps/${groupId}`}>Open overlap group</Link>}
      </Space>
    }
  />
);

export default OverlapBanner;
