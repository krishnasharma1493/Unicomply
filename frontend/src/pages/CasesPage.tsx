import React from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Space, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { WarningFilled } from '@ant-design/icons';
import { BureauChip, SlaBadge, StatusChip } from '../components/ui';
import { QueryBoundary } from '../components/states';
import { CaseFilterBar } from '../features/cases/CaseFilterBar';
import { isFiltered, PAGE_SIZES, parseFilters, toSearch, type CaseFilters } from '../features/cases/listFilters';
import { useCaseList } from '../features/cases/useCaseList';
import { useMeta } from '../features/meta/useMeta';
import type { CaseRead, Meta } from '../lib/api/types';
import { formatDate } from '../lib/format';

const { Title, Text } = Typography;

const columns = (meta: Meta): ColumnsType<CaseRead> => [
  {
    title: 'Case',
    key: 'case_ref',
    width: 190,
    render: (_, c) => (
      <Space orientation="vertical" size={0}>
        <Link to={`/cases/${c.id}`} onClick={(e) => e.stopPropagation()}><Text strong>{c.case_ref}</Text></Link>
        <Text type="secondary" style={{ fontSize: 12 }}>{formatDate(c.received_at)}</Text>
      </Space>
    ),
  },
  {
    title: 'Institution',
    key: 'institution',
    render: (_, c) => (
      <Space orientation="vertical" size={0}>
        <Text>{c.institution_name ?? c.raw_institution_text}</Text>
        {c.permanent_id ? <Tag color="blue" style={{ margin: 0 }}>{c.permanent_id}</Tag> : <Tag style={{ margin: 0 }}>Not matched yet</Tag>}
      </Space>
    ),
  },
  {
    title: 'Bureau',
    key: 'bureau',
    width: 120,
    render: (_, c) => {
      const b = meta.bureaus.find((x) => x.id === c.current_bureau_id);
      return <BureauChip code={b?.code ?? String(c.current_bureau_id)} name={b?.name} />;
    },
  },
  { title: 'Category', key: 'category', width: 170, render: (_, c) => meta.categories.find((k) => k.id === c.category_id)?.name ?? c.category_id },
  { title: 'Status', key: 'status', width: 140, render: (_, c) => <StatusChip status={c.status} /> },
  {
    title: 'SLA',
    key: 'sla',
    width: 150,
    render: (_, c) => <SlaBadge ageDays={c.age_days} beyondSla={c.beyond_sla} receivedAt={c.received_at} slaDueOn={c.sla_due_on} status={c.status} />,
  },
  {
    title: 'Overlap',
    key: 'overlap',
    width: 100,
    render: (_, c) =>
      c.in_overlap ? (
        <Tooltip title="This case is in an open overlap group">
          <Tag color="red" icon={<WarningFilled />}>Overlap</Tag>
        </Tooltip>
      ) : (
        <Text type="secondary">—</Text>
      ),
  },
  { title: 'Officer', key: 'officer', width: 150, render: (_, c) => meta.officers.find((o) => o.id === c.assigned_officer_id)?.name ?? <Text type="secondary">Not assigned</Text> },
];

const CaseTable: React.FC<{ filters: CaseFilters; meta: Meta; setFilters: (f: CaseFilters) => void }> = ({ filters, meta, setFilters }) => {
  const navigate = useNavigate();
  const list = useCaseList(filters);
  return (
    <QueryBoundary
      query={list}
      loadingTip="Loading cases"
      isEmpty={(page) => page.data.length === 0}
      emptyTitle="No cases found"
      emptyDescription={isFiltered(filters) ? 'No case matches these filters. Widen the search or clear the filters.' : 'There are no cases in your scope yet.'}
    >
      {(page) => (
        <Table<CaseRead>
          rowKey="id"
          dataSource={page.data}
          columns={columns(meta)}
          scroll={{ x: 1100 }}
          loading={list.isFetching}
          onRow={(c) => ({ onClick: () => navigate(`/cases/${c.id}`), style: { cursor: 'pointer' } })}
          pagination={{
            current: page.pagination.page,
            pageSize: page.pagination.limit,
            total: page.pagination.total,
            pageSizeOptions: PAGE_SIZES,
            showSizeChanger: true,
            showTotal: (total) => `${total} ${total === 1 ? 'case' : 'cases'}`,
            onChange: (p, size) => setFilters({ ...filters, page: size !== filters.limit ? 1 : p, limit: size }),
          }}
        />
      )}
    </QueryBoundary>
  );
};

export const CasesPage: React.FC = () => {
  const [search, setSearch] = useSearchParams();
  const filters = parseFilters(search);
  const meta = useMeta();
  const setFilters = (next: CaseFilters) => setSearch(toSearch(next));
  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      <Title level={2} style={{ marginBottom: 0 }}>Cases</Title>
      <Text type="secondary">Search by institution, reference, bureau, region, category, status or date. Newest first.</Text>
      <div style={{ marginTop: 16 }}>
        <QueryBoundary query={meta} loadingTip="Loading filters">
          {(m) => (
            <>
              <CaseFilterBar key={search.toString()} filters={filters} meta={m} onApply={setFilters} />
              <CaseTable filters={filters} meta={m} setFilters={setFilters} />
            </>
          )}
        </QueryBoundary>
      </div>
    </div>
  );
};

export default CasesPage;
