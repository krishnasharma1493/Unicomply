import React from 'react';
import { Link } from 'react-router-dom';
import { ExclamationCircleFilled, WarningFilled } from '@ant-design/icons';
import { OVERLAP_BANNERS, type OverlapTier } from '../../lib/api/enums';
import { BureauChip } from '../ui';

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
 * The tier is always written out and carries its own icon, never colour alone.
 */
export const OverlapBanner: React.FC<OverlapBannerProps> = ({ tier, bureauCodes, caseCount, groupId }) => (
  <div role="alert" className={`uc-banner uc-banner--${tier}`}>
    <span className="uc-banner-icon" aria-hidden="true">
      {tier === 'probable' ? <ExclamationCircleFilled /> : <WarningFilled />}
    </span>
    <div className="uc-banner-body">
      <strong className="uc-banner-title">{OVERLAP_BANNERS[tier]}</strong>
      <div className="uc-banner-meta">
        <span>
          {caseCount} {caseCount === 1 ? 'case' : 'cases'} handled by
        </span>
        {bureauCodes.map((code) => (
          <BureauChip key={code} code={code} />
        ))}
      </div>
    </div>
    {groupId !== undefined && (
      <Link className="uc-banner-link" to={`/overlaps/${groupId}`}>
        Open overlap group
      </Link>
    )}
  </div>
);

export default OverlapBanner;
