import React, { useState } from 'react';
import { Col, Pagination, Row, Select, Space, Tabs, Typography } from 'antd';
import { QueryBoundary } from '../components/states';
import { OverlapGroupCard } from '../features/overlaps/list/OverlapGroupCard';
import { DECIDED_STATUSES, PAGE_SIZE, useOverlapList, type OverlapListFilters, type OverlapTab } from '../features/overlaps/list/useOverlapList';
import { useMeta } from '../features/meta/useMeta';
import { OVERLAP_GROUP_STATUS_LABELS, OVERLAP_LEVELS, OVERLAP_LEVEL_LABELS } from '../lib/api/enums';

const { Title, Paragraph } = Typography;

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
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <Title level={2}>Overlap Center</Title>
      <Paragraph type="secondary">
        Cases about the same institution that more than one bureau is handling. Open a group to compare the cases and decide.
      </Paragraph>
      <Tabs
        activeKey={filters.tab}
        onChange={(key) => patch({ tab: key as OverlapTab })}
        items={[
          { key: 'probable', label: 'Probable' },
          { key: 'possible', label: 'Possible' },
          { key: 'decided', label: 'Decided' },
        ]}
      />
      <Space wrap style={{ marginBottom: 16 }}>
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
      </Space>
      <QueryBoundary query={list} loadingTip="Loading overlap groups" emptyDescription={EMPTY[filters.tab]} isEmpty={(page) => page.data.length === 0}>
        {(page) => (
          <>
            <Row gutter={[16, 16]}>
              {page.data.map((group) => (
                <Col key={group.id} xs={24} md={12} xl={8}>
                  <OverlapGroupCard group={group} today={meta.data?.today} />
                </Col>
              ))}
            </Row>
            <Pagination
              style={{ marginTop: 16, textAlign: 'right' }}
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
