import React from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import { QueryBoundary } from '../components/states';
import { BackLink } from '../components/layout/PageHeader';
import { CaseView } from '../features/cases/CaseView';
import { useCaseDetail } from '../features/cases/useCaseDetail';
import { readFromList } from '../features/cases/useSplitView';
import { useMeta } from '../features/meta/useMeta';

/**
 * A case, full page: below the split-view width, or opened from anywhere but the list. Arriving from
 * the list, the back link returns to that exact list and Previous / Next step through it.
 */
export const CaseDetailPage: React.FC = () => {
  const id = Number(useParams().id);
  const location = useLocation();
  const fromList = readFromList(location.state);
  const detail = useCaseDetail(id);
  const meta = useMeta();
  const at = fromList ? fromList.ids.indexOf(id) : -1;
  const prev = at > 0 ? fromList!.ids[at - 1] : null;
  const next = at >= 0 && at < fromList!.ids.length - 1 ? fromList!.ids[at + 1] : null;
  const back = fromList?.from ?? '/cases';

  return (
    <div className="uc-page">
      <div className="uc-case-nav">
        <BackLink to={back} label={fromList ? 'Back to the list' : 'All cases'} />
        {at >= 0 && (
          <nav aria-label="Cases in this list" className="uc-case-steps">
            <span className="uc-meta uc-num">
              {at + 1} of {fromList!.ids.length}
            </span>
            {prev !== null ? (
              <Link to={`/cases/${prev}`} state={fromList} className="uc-step">
                <LeftOutlined aria-hidden="true" /> Previous case
              </Link>
            ) : (
              <span className="uc-step is-off" aria-disabled="true"><LeftOutlined aria-hidden="true" /> Previous case</span>
            )}
            {next !== null ? (
              <Link to={`/cases/${next}`} state={fromList} className="uc-step">
                Next case <RightOutlined aria-hidden="true" />
              </Link>
            ) : (
              <span className="uc-step is-off" aria-disabled="true">Next case <RightOutlined aria-hidden="true" /></span>
            )}
          </nav>
        )}
      </div>
      <div>
        <QueryBoundary query={meta} loadingTip="Loading">
          {(m) => (
            <QueryBoundary query={detail} loadingTip="Loading case">
              {(d) => <CaseView key={d.case.id} detail={d} meta={m} listHref={back} />}
            </QueryBoundary>
          )}
        </QueryBoundary>
      </div>
    </div>
  );
};

export default CaseDetailPage;
