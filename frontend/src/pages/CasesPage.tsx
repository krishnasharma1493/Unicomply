import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, Table, Typography, Space, Button, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ReloadOutlined, FolderOpenOutlined } from '@ant-design/icons';
import { client } from '../lib/api/client';
import type { CaseRead, Page } from '../lib/api/types';
import { formatDate } from '../lib/format';
import { StatusChip, BureauChip, SlaBadge } from '../components/ui';
import { QueryBoundary } from '../components/states';
import { BUREAU_CODE_MAP } from '../theme';

const { Title, Text } = Typography;

export const CasesPage: React.FC = () => {
  const query = useQuery<Page<CaseRead>>({
    queryKey: ['cases'],
    queryFn: async () => {
      const res = await client.get<Page<CaseRead>>('/cases');
      return res.data;
    },
  });

  const columns: ColumnsType<CaseRead> = [
    {
      title: 'Case Reference',
      dataIndex: 'case_ref',
      key: 'case_ref',
      width: 190,
      render: (caseRef: string, record) => (
        <div>
          <div style={{ fontWeight: 600, color: '#1e3a8a', fontSize: '13px' }}>
            {caseRef}
          </div>
          <Space orientation="horizontal" size={4} style={{ marginTop: '2px' }} wrap>
            <Tag style={{ fontSize: '10px', margin: 0, padding: '0 4px', lineHeight: '16px' }}>
              {record.source_channel.replace('_', ' ').toUpperCase()}
            </Tag>
            <Text type="secondary" style={{ fontSize: '11px' }}>
              {formatDate(record.received_at)}
            </Text>
          </Space>
        </div>
      ),
    },
    {
      title: 'Institution',
      key: 'institution',
      minWidth: 240,
      render: (_, record) => {
        const instName = record.institution_name || record.raw_institution_text;
        const locationParts = [record.raw_district, record.raw_state].filter(Boolean).join(', ');

        return (
          <div>
            <div style={{ fontWeight: 500, fontSize: '13px', color: '#0f172a' }}>
              {instName}
            </div>
            <Space orientation="horizontal" size={6} style={{ marginTop: '2px' }} wrap>
              {record.permanent_id ? (
                <Tag color="blue" style={{ fontSize: '11px', margin: 0, padding: '0 4px' }}>
                  {record.permanent_id}
                </Tag>
              ) : (
                <Tag style={{ fontSize: '10px', margin: 0, padding: '0 4px', color: '#64748b' }}>
                  Unresolved
                </Tag>
              )}
              {locationParts && (
                <Text type="secondary" style={{ fontSize: '11px' }}>
                  {locationParts}
                </Text>
              )}
            </Space>
          </div>
        );
      },
    },
    {
      title: 'Bureau',
      dataIndex: 'current_bureau_id',
      key: 'current_bureau_id',
      width: 140,
      render: (bureauId: number) => {
        const bureauInfo = BUREAU_CODE_MAP[bureauId];
        const code = bureauInfo ? bureauInfo.code : `Bureau #${bureauId}`;
        const kind = bureauInfo?.kind;
        const name = bureauInfo?.name;

        return <BureauChip code={code} kind={kind} name={name} />;
      },
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 140,
      render: (status) => <StatusChip status={status} />,
    },
    {
      title: 'SLA Status',
      key: 'sla',
      width: 150,
      render: (_, record) => (
        <SlaBadge
          ageDays={record.age_days}
          beyondSla={record.beyond_sla}
          receivedAt={record.received_at}
          slaDueOn={record.sla_due_on}
          status={record.status}
        />
      ),
    },
  ];

  return (
    <div>
      {/* Page Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '20px',
        }}
      >
        <div>
          <Title level={2} style={{ margin: '0 0 4px 0', color: '#0f172a' }}>
            Cases Repository
          </Title>
          <Text type="secondary" style={{ fontSize: '13px' }}>
            Unified queue of grievances, regulatory complaints, and active compliance proceedings
          </Text>
        </div>

        <Space orientation="horizontal" size={10}>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => query.refetch()}
            loading={query.isFetching}
          >
            Refresh
          </Button>
        </Space>
      </div>

      {/* QueryBoundary wrapping Table */}
      <QueryBoundary
        query={query}
        isEmpty={(page) => !page?.data || page.data.length === 0}
        emptyTitle="No Cases Found"
        emptyDescription="There are currently no cases matching the active filters or scope."
        card
      >
        {(page) => (
          <Card
            styles={{ body: { padding: '0' } }}
            style={{
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              overflow: 'hidden',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}
          >
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: '#ffffff',
              }}
            >
              <Space orientation="horizontal" size={8}>
                <FolderOpenOutlined style={{ color: '#1e3a8a', fontSize: '16px' }} />
                <Text strong style={{ fontSize: '14px', color: '#1e293b' }}>
                  All Active Cases
                </Text>
                <Tag color="default" style={{ fontWeight: 600, fontSize: '12px' }}>
                  {page.pagination?.total ?? page.data.length} records
                </Tag>
              </Space>

              <Text type="secondary" style={{ fontSize: '12px' }}>
                Sorted by most recent
              </Text>
            </div>

            <Table<CaseRead>
              columns={columns}
              dataSource={page.data}
              rowKey="id"
              scroll={{ x: 860 }}
              sticky
              pagination={{
                pageSize: 10,
                showSizeChanger: true,
                pageSizeOptions: ['10', '20', '50'],
                showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} cases`,
              }}
              style={{ borderRadius: 0 }}
            />
          </Card>
        )}
      </QueryBoundary>
    </div>
  );
};

export default CasesPage;
