import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Input, Pagination, Select } from 'antd';
import { PageHeader } from '../components/layout/PageHeader';
import { QueryBoundary } from '../components/states';
import { useInstitutionSearch, SEARCH_PAGE_SIZE, type InstitutionFilters } from '../features/institutions/useInstitutions';
import { INST_TYPES, INST_TYPE_LABELS, REGIONS, REGION_LABELS } from '../lib/api/enums';
import '../styles/institutions.css';

export const InstitutionsPage: React.FC = () => {
  const [filters, setFilters] = useState<InstitutionFilters>({ q: '', state: '', region: null, instType: null, page: 1 });
  const patch = (next: Partial<InstitutionFilters>) => setFilters((f) => ({ ...f, page: 1, ...next }));
  const search = useInstitutionSearch(filters);

  return (
    <div className="uc-page">
      <PageHeader title="Institutions" subtitle="Find an institution by name, acronym or AICTE Permanent ID to see every case about it, across all bureaus." />
      <div className="uc-filters ins-search" role="search" aria-label="Search the registry">
        <Input.Search
          aria-label="Name or Permanent ID"
          placeholder="Name, acronym or Permanent ID"
          allowClear
          className="ins-search-q"
          value={filters.q}
          onChange={(e) => patch({ q: e.target.value })}
        />
        <Input aria-label="State" placeholder="State" allowClear style={{ width: 180 }} value={filters.state} onChange={(e) => patch({ state: e.target.value })} />
        <Select
          aria-label="Region"
          allowClear
          placeholder="Any region"
          style={{ minWidth: 160 }}
          value={filters.region ?? undefined}
          onChange={(region) => patch({ region: region ?? null })}
          options={REGIONS.map((r) => ({ value: r, label: REGION_LABELS[r] }))}
        />
        <Select
          aria-label="Type"
          allowClear
          placeholder="Any type"
          style={{ minWidth: 200 }}
          value={filters.instType ?? undefined}
          onChange={(instType) => patch({ instType: instType ?? null })}
          options={INST_TYPES.map((t) => ({ value: t, label: INST_TYPE_LABELS[t] }))}
        />
      </div>
      <QueryBoundary
        query={search}
        loadingTip="Searching the registry"
        isEmpty={(p) => p.data.length === 0}
        emptyTitle="No institution found"
        emptyDescription="Try a shorter name, the acronym, or the Permanent ID."
      >
        {(page) => (
          <>
            <p className="uc-meta ins-total uc-num" aria-live="polite">
              {page.pagination.total} {page.pagination.total === 1 ? 'institution' : 'institutions'}
            </p>
            <ul className="uc-section ins-list" aria-label="Institutions">
              {page.data.map((inst) => (
                <li key={inst.permanent_id} className="ins-row">
                  <div className="ins-row-main">
                    <h2 className="ins-row-title">
                      <Link to={`/institutions/${inst.permanent_id}`}>{inst.name}</Link>
                    </h2>
                    <div className="ins-row-meta uc-meta">
                      <span className="uc-label">{inst.permanent_id}</span>
                      <span>
                        {inst.district}, {inst.state}
                      </span>
                      <span>{REGION_LABELS[inst.region]}</span>
                      <span>{INST_TYPE_LABELS[inst.inst_type]}</span>
                    </div>
                  </div>
                  <div className="ins-row-side">
                    <span className={`uc-num ins-open${inst.open_case_count > 0 ? ' has-open' : ''}`}>
                      {inst.open_case_count} open {inst.open_case_count === 1 ? 'case' : 'cases'}
                    </span>
                    {inst.trust_name && <span className="uc-meta">{inst.trust_name}</span>}
                  </div>
                </li>
              ))}
            </ul>
            <Pagination
              style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}
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
