import React, { useState } from 'react';
import { Pagination, Segmented, Select } from 'antd';
import { PageHeader } from '../components/layout/PageHeader';
import { QueryBoundary } from '../components/states';
import { OverlapGroupCard } from '../features/overlaps/list/OverlapGroupCard';
import { DECIDED_STATUSES, PAGE_SIZE, useOverlapList, type OverlapListFilters, type OverlapTab } from '../features/overlaps/list/useOverlapList';
import { useMeta } from '../features/meta/useMeta';
import { OVERLAP_GROUP_STATUS_LABELS, OVERLAP_LEVELS, OVERLAP_LEVEL_LABELS } from '../lib/api/enums';

const EMPTY: Record<OverlapTab, string> = {
  probable: 'No probable overlaps are waiting for a decision.',
  possible: 'No possible overlaps are waiting for a decision.',
  decided: 'No overlap groups with this decision yet.',
};

export const OverlapCenterPage: React.FC = () => {
  const [filters, setFilters] = useState<OverlapListFilters>({ tab: 'probable', decision: 'confirmed', level: null, bureauId: null, page: 1 });
  const patch = (next: Partial<OverlapListFilters>) => setFilters((f) => ({ ...f, page: 1, ...next }));
  const list = useOverlapList(filters);
  const meta = useMeta();

  return (
    <div className="uc-page">
      <PageHeader
        title="Overlap Center"
        subtitle="Cases about the same institution that more than one bureau is handling. Open a group to compare the cases and decide."
      />
      <div className="uc-toolbar-row">
        <Segmented<OverlapTab>
          aria-label="Overlap tier"
          value={filters.tab}
          onChange={(key) => patch({ tab: key })}
          options={[
            { value: 'probable', label: 'Probable' },
            { value: 'possible', label: 'Possible' },
            { value: 'decided', label: 'Decided' },
          ]}
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
      <QueryBoundary query={list} loadingTip="Loading overlap groups" emptyDescription={EMPTY[filters.tab]} isEmpty={(page) => page.data.length === 0}>
        {(page) => (
          <>
            <ul className="uc-section uc-group-list" aria-label="Overlap groups">
              {page.data.map((group) => (
                <li key={group.id}>
                  <OverlapGroupCard group={group} today={meta.data?.today} />
                </li>
              ))}
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
    </div>
  );
};

export default OverlapCenterPage;
