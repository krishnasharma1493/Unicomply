import React, { useState } from 'react';
import { Button, Card, Col, DatePicker, Form, Input, Row, Select, Space } from 'antd';
import dayjs from 'dayjs';
import { CASE_STATUS_LABELS, CASE_STATUSES, REGION_LABELS, REGIONS } from '../../lib/api/enums';
import type { Meta } from '../../lib/api/types';
import { emptyFilters, type CaseFilters } from './listFilters';

const TRI = [
  { value: 'any', label: 'Any' },
  { value: 'true', label: 'Yes' },
  { value: 'false', label: 'No' },
];
const triValue = (v: boolean | null) => (v === null ? 'any' : String(v));
const triParse = (v: string): boolean | null => (v === 'any' ? null : v === 'true');

export interface CaseFilterBarProps {
  filters: CaseFilters;
  meta: Meta;
  onApply: (next: CaseFilters) => void;
}

/**
 * The search form. Edits stay in a draft until "Search" so that typing does not fire a request per key;
 * the URL (and so the request) only changes on Search or Clear.
 */
export const CaseFilterBar: React.FC<CaseFilterBarProps> = ({ filters, meta, onApply }) => {
  const [draft, setDraft] = useState(filters);
  const set = (patch: Partial<CaseFilters>) => setDraft((d) => ({ ...d, ...patch }));
  const search = () => onApply({ ...draft, page: 1 });
  const clear = () => {
    setDraft({ ...emptyFilters, limit: filters.limit });
    onApply({ ...emptyFilters, limit: filters.limit });
  };

  return (
    <Card size="small" style={{ marginBottom: 16 }}>
      <Form layout="vertical" onFinish={search} role="search" aria-label="Search cases">
        <Row gutter={12}>
          <Col xs={24} md={8}><Form.Item label="Institution name"><Input aria-label="Institution name" allowClear value={draft.q} onChange={(e) => set({ q: e.target.value })} placeholder="Name or what was written" /></Form.Item></Col>
          <Col xs={24} md={8}><Form.Item label="Permanent ID"><Input aria-label="Permanent ID" allowClear value={draft.permanentId} onChange={(e) => set({ permanentId: e.target.value })} placeholder="1-43655981521" /></Form.Item></Col>
          <Col xs={24} md={8}><Form.Item label="Case reference"><Input aria-label="Case reference" allowClear value={draft.caseRef} onChange={(e) => set({ caseRef: e.target.value })} placeholder="PGRC/2026/00412" /></Form.Item></Col>
        </Row>
        <Row gutter={12}>
          <Col xs={24} md={6}>
            <Form.Item label="Bureau">
              <Select aria-label="Bureau" allowClear placeholder="Any bureau" value={draft.bureauId ?? undefined} onChange={(v) => set({ bureauId: v ?? null })}
                options={meta.bureaus.map((b) => ({ value: b.id, label: `${b.code} — ${b.name}` }))} />
            </Form.Item>
          </Col>
          <Col xs={24} md={6}>
            <Form.Item label="Region">
              <Select aria-label="Region" allowClear placeholder="Any region" value={draft.region ?? undefined} onChange={(v) => set({ region: v ?? null })}
                options={REGIONS.map((r) => ({ value: r, label: REGION_LABELS[r] }))} />
            </Form.Item>
          </Col>
          <Col xs={24} md={6}>
            <Form.Item label="Category">
              <Select aria-label="Category" allowClear placeholder="Any category" value={draft.category || undefined} onChange={(v) => set({ category: v ?? '' })}
                options={meta.categories.map((c) => ({ value: c.code, label: c.name }))} />
            </Form.Item>
          </Col>
          <Col xs={24} md={6}>
            <Form.Item label="Status">
              <Select aria-label="Status" mode="multiple" allowClear placeholder="Any status" value={draft.statuses} onChange={(v) => set({ statuses: v })}
                options={CASE_STATUSES.map((s) => ({ value: s, label: CASE_STATUS_LABELS[s] }))} maxTagCount="responsive" />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={12}>
          <Col xs={24} md={8}>
            <Form.Item label="Received between">
              <DatePicker.RangePicker
                style={{ width: '100%' }}
                format="DD MMM YYYY"
                value={[draft.from ? dayjs(draft.from) : null, draft.to ? dayjs(draft.to) : null]}
                onChange={(range) => set({ from: range?.[0]?.format('YYYY-MM-DD') ?? '', to: range?.[1]?.format('YYYY-MM-DD') ?? '' })}
                allowEmpty={[true, true]}
              />
            </Form.Item>
          </Col>
          <Col xs={8} md={4}><Form.Item label="Open"><Select aria-label="Open" value={triValue(draft.pending)} onChange={(v) => set({ pending: triParse(v) })} options={TRI} /></Form.Item></Col>
          <Col xs={8} md={4}><Form.Item label="Beyond SLA"><Select aria-label="Beyond SLA" value={triValue(draft.beyondSla)} onChange={(v) => set({ beyondSla: triParse(v) })} options={TRI} /></Form.Item></Col>
          <Col xs={8} md={4}><Form.Item label="In an overlap"><Select aria-label="In an overlap" value={triValue(draft.inOverlap)} onChange={(v) => set({ inOverlap: triParse(v) })} options={TRI} /></Form.Item></Col>
          <Col xs={24} md={4}>
            <Form.Item label=" " colon={false}>
              <Space>
                <Button type="primary" htmlType="submit">Search</Button>
                <Button onClick={clear}>Clear</Button>
              </Space>
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Card>
  );
};
