import React, { useState } from 'react';
import { Pagination, Segmented, Select } from 'antd';
import { AnimatePresence, motion } from 'motion/react';
import { PageHeader } from '../components/layout/PageHeader';
import { LoadingState, QueryBoundary } from '../components/states';
import { OverlapGroupCard } from '../features/overlaps/list/OverlapGroupCard';
import {
  DECIDED_STATUSES,
  PAGE_SIZE,
  useOverlapCounts,
  useOverlapList,
  type OverlapListFilters,
  type OverlapTab,
} from '../features/overlaps/list/useOverlapList';
import { useMeta } from '../features/meta/useMeta';
import { OVERLAP_GROUP_STATUS_LABELS, OVERLAP_LEVELS, OVERLAP_LEVEL_LABELS } from '../lib/api/enums';
import { useMotionPrefs } from '../lib/motion';
import '../styles/overlaps.css';

const EMPTY: Record<OverlapTab, string> = {
  probable: 'No probable overlaps are waiting for a decision.',
  possible: 'No possible overlaps are waiting for a decision.',
  decided: 'No overlap groups with this decision yet.',
};

const TAB_LABELS: Record<OverlapTab, string> = { probable: 'Probable', possible: 'Possible', decided: 'Decided' };

export const OverlapCenterPage: React.FC = () => {
  const [filters, setFilters] = useState<OverlapListFilters>({ tab: 'probable', decision: 'confirmed', level: null, bureauId: null, page: 1 });
  // Until the user picks a tab, the page opens on the first tier that has something waiting.
  const [chosen, setChosen] = useState(false);
  const patch = (next: Partial<OverlapListFilters>) => setFilters((f) => ({ ...f, page: 1, ...next }));
  const list = useOverlapList(filters);
  const counts = useOverlapCounts(list.isFetched || list.isError);
  const meta = useMeta();
  const prefs = useMotionPrefs();

  const nothingProbable =
    !chosen && filters.tab === 'probable' && filters.level === null && filters.bureauId === null && list.data?.pagination.total === 0 && !list.isPlaceholderData;
  if (nothingProbable) {
    setChosen(true);
    patch({ tab: 'possible' });
  }

  return (
    <div className="uc-page">
      <PageHeader
        title="Overlap Center"
        subtitle="Cases about the same institution that more than one bureau is handling. Open a group to compare the cases and decide."
      />
      <div className="uc-toolbar-row">
        <Segmented<OverlapTab>
          aria-label="Overlap tier"
          className="ov-tiers"
          value={filters.tab}
          onChange={(key) => {
            setChosen(true);
            patch({ tab: key });
          }}
          options={(['probable', 'possible', 'decided'] as OverlapTab[]).map((tab) => ({
            value: tab,
            label: (
              <span className="ov-tier-label">
                {TAB_LABELS[tab]}
                {counts[tab] !== undefined && (
                  <>
                    {' '}
                    <span className={`ov-tier-count uc-num${tab === 'probable' && counts[tab]! > 0 ? ' is-probable' : ''}`}>{counts[tab]}</span>
                  </>
                )}
              </span>
            ),
          }))}
        />
        <div className="uc-filters">
          {filters.tab === 'decided' && (
            <Select
              aria-label="Decision"
              style={{ minWidth: 160 }}
              value={filters.decision}
              onChange={(decision) => patch({ decision })}
              options={DECIDED_STATUSES.map((s) => ({ value: s, label: OVERLAP_GROUP_STATUS_LABELS[s] }))}
            />
          )}
          <Select
            aria-label="Level"
            allowClear
            placeholder="All levels"
            style={{ minWidth: 160 }}
            value={filters.level ?? undefined}
            onChange={(level) => patch({ level: level ?? null })}
            options={OVERLAP_LEVELS.map((l) => ({ value: l, label: OVERLAP_LEVEL_LABELS[l] }))}
          />
          <Select
            aria-label="Bureau"
            allowClear
            placeholder="All bureaus"
            style={{ minWidth: 200 }}
            value={filters.bureauId ?? undefined}
            onChange={(bureauId) => patch({ bureauId: bureauId ?? null })}
            options={(meta.data?.bureaus ?? []).map((b) => ({ value: b.id, label: `${b.code} — ${b.name}` }))}
          />
        </div>
      </div>
      {nothingProbable ? (
        <LoadingState tip="Loading overlap groups" />
      ) : (
        <QueryBoundary query={list} loadingTip="Loading overlap groups" emptyDescription={EMPTY[filters.tab]} isEmpty={(page) => page.data.length === 0}>
          {(page) => (
            <>
              <ul className="uc-section uc-group-list" aria-label="Overlap groups">
                {/* Rows that stay glide to their new place; rows that leave or arrive fade. Nothing cascades on first load. */}
                <AnimatePresence initial={false} mode="popLayout">
                  {page.data.map((group) => (
                    <motion.li
                      key={group.id}
                      layout={prefs.reduce ? false : 'position'}
                      initial={prefs.enter(4)}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={prefs.spring}
                    >
                      <OverlapGroupCard group={group} today={meta.data?.today} />
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
              <Pagination
                style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}
                current={page.pagination.page}
                pageSize={PAGE_SIZE}
                total={page.pagination.total}
                showSizeChanger={false}
                hideOnSinglePage
                onChange={(next) => setFilters((f) => ({ ...f, page: next }))}
              />
            </>
          )}
        </QueryBoundary>
      )}
    </div>
  );
};

export default OverlapCenterPage;
