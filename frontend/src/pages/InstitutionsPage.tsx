import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, Input, List, Pagination, Select, Space, Tag, Typography } from 'antd';
import { QueryBoundary } from '../components/states';
import { useInstitutionSearch, SEARCH_PAGE_SIZE, type InstitutionFilters } from '../features/institutions/useInstitutions';
import { INST_TYPES, INST_TYPE_LABELS, REGIONS, REGION_LABELS } from '../lib/api/enums';

const { Title, Text } = Typography;

export const InstitutionsPage: React.FC = () => {
  const [filters, setFilters] = useState<InstitutionFilters>({ q: '', state: '', region: null, instType: null, page: 1 });
  const patch = (next: Partial<InstitutionFilters>) => setFilters((f) => ({ ...f, page: 1, ...next }));
  const search = useInstitutionSearch(filters);

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <Title level={2} style={{ marginBottom: 0 }}>Institutions</Title>
      <Text type="secondary">Find an institution by name, acronym or AICTE Permanent ID to see every case about it, across all bureaus.</Text>
      <Card size="small" style={{ margin: '16px 0' }}>
        <Space wrap style={{ width: '100%' }}>
          <Input.Search
            aria-label="Name or Permanent ID"
            placeholder="Name, acronym or Permanent ID"
            allowClear
            style={{ minWidth: 300 }}
            value={filters.q}
            onChange={(e) => patch({ q: e.target.value })}
          />
          <Input aria-label="State" placeholder="State" allowClear style={{ width: 180 }} value={filters.state} onChange={(e) => patch({ state: e.target.value })} />
          <Select aria-label="Region" allowClear placeholder="Any region" style={{ minWidth: 160 }} value={filters.region ?? undefined} onChange={(region) => patch({ region: region ?? null })}
            options={REGIONS.map((r) => ({ value: r, label: REGION_LABELS[r] }))} />
          <Select aria-label="Type" allowClear placeholder="Any type" style={{ minWidth: 200 }} value={filters.instType ?? undefined} onChange={(instType) => patch({ instType: instType ?? null })}
            options={INST_TYPES.map((t) => ({ value: t, label: INST_TYPE_LABELS[t] }))} />
        </Space>
      </Card>
      <QueryBoundary query={search} loadingTip="Searching the registry" isEmpty={(p) => p.data.length === 0} emptyTitle="No institution found" emptyDescription="Try a shorter name, the acronym, or the Permanent ID.">
        {(page) => (
          <>
            <List
              bordered
              dataSource={page.data}
              renderItem={(inst) => (
                <List.Item
                  extra={
                    <Space orientation="vertical" align="end" size={2}>
                      <Text strong>{inst.open_case_count} open {inst.open_case_count === 1 ? 'case' : 'cases'}</Text>
                      {inst.trust_name && <Text type="secondary">{inst.trust_name}</Text>}
                    </Space>
                  }
                >
                  <List.Item.Meta
                    title={<Link to={`/institutions/${inst.permanent_id}`}>{inst.name}</Link>}
                    description={
                      <Space wrap size={[8, 2]}>
                        <Tag color="blue" style={{ margin: 0 }}>{inst.permanent_id}</Tag>
                        <span>{inst.district}, {inst.state}</span>
                        <span>{REGION_LABELS[inst.region]}</span>
                        <span>{INST_TYPE_LABELS[inst.inst_type]}</span>
                      </Space>
                    }
                  />
                </List.Item>
              )}
            />
            <Pagination
              style={{ marginTop: 16, textAlign: 'right' }}
              current={page.pagination.page}
              pageSize={SEARCH_PAGE_SIZE}
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

export default InstitutionsPage;
