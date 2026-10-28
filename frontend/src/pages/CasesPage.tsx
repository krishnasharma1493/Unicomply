import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useLocation, useMatch, useNavigate, useOutlet, useSearchParams } from 'react-router-dom';
import { Button, Pagination, Select, Table, Tooltip, Typography } from 'antd';
import { motion } from 'motion/react';
import type { ColumnsType } from 'antd/es/table';
import { CloseOutlined, DownOutlined, WarningFilled } from '@ant-design/icons';
import { PageHeader } from '../components/layout/PageHeader';
import { BureauChip, SlaBadge, StatusChip } from '../components/ui';
import { QueryBoundary } from '../components/states';
import { CaseFilterBar } from '../features/cases/CaseFilterBar';
import { CaseView } from '../features/cases/CaseView';
import {
  describeFilters,
  filterTokens,
  isFiltered,
  PAGE_SIZES,
  parseFilters,
  SORT_LABELS,
  toSearch,
  type CaseFilters,
  type CaseSort,
} from '../features/cases/listFilters';
import { useCaseDetail } from '../features/cases/useCaseDetail';
import { useCaseList } from '../features/cases/useCaseList';
import { useSplitView, type FromList } from '../features/cases/useSplitView';
import { useMeta } from '../features/meta/useMeta';
import type { CaseRead, Meta } from '../lib/api/types';
import { formatDate } from '../lib/format';
import { useMotionPrefs } from '../lib/motion';
import '../styles/cases.css';

const { Text } = Typography;

const OverlapMark: React.FC = () => (
  <span className="uc-overlap-mark">
    <WarningFilled aria-hidden="true" />
    Overlap
  </span>
);

const columns = (meta: Meta): ColumnsType<CaseRead> => [
  {
    title: 'Case',
    key: 'case_ref',
    width: 168,
    render: (_, c) => (
      <div className="uc-cell-stack">
        <Link to={`/cases/${c.id}`} onClick={(e) => e.stopPropagation()} className="uc-num" style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{c.case_ref}</Link>
        <span className="uc-meta">{formatDate(c.received_at)}</span>
      </div>
    ),
  },
  {
    title: 'Institution',
    key: 'institution',
    render: (_, c) => (
      <div className="uc-cell-stack">
        <span>{c.institution_name ?? c.raw_institution_text}</span>
        {c.permanent_id ? <span className="uc-meta uc-num">{c.permanent_id}</span> : <span className="uc-meta" style={{ fontStyle: 'italic' }}>Not matched yet</span>}
      </div>
    ),
  },
  {
    title: 'Bureau',
    key: 'bureau',
    width: 96,
    render: (_, c) => {
      const b = meta.bureaus.find((x) => x.id === c.current_bureau_id);
      return <BureauChip code={b?.code ?? String(c.current_bureau_id)} name={b?.name} />;
    },
  },
  { title: 'Category', key: 'category', width: 160, render: (_, c) => meta.categories.find((k) => k.id === c.category_id)?.name ?? c.category_id },
  { title: 'Status', key: 'status', width: 130, render: (_, c) => <StatusChip status={c.status} /> },
  {
    title: 'SLA',
    key: 'sla',
    width: 124,
    render: (_, c) => <SlaBadge ageDays={c.age_days} beyondSla={c.beyond_sla} receivedAt={c.received_at} slaDueOn={c.sla_due_on} status={c.status} />,
  },
  {
    title: 'Overlap',
    key: 'overlap',
    width: 104,
    render: (_, c) =>
      c.in_overlap ? (
        <Tooltip title="This case is in an open overlap group">
          <span><OverlapMark /></span>
        </Tooltip>
      ) : (
        <Text type="secondary">—</Text>
      ),
  },
  { title: 'Officer', key: 'officer', width: 140, render: (_, c) => meta.officers.find((o) => o.id === c.assigned_officer_id)?.name ?? <Text type="secondary">Not assigned</Text> },
];

interface ListProps {
  filters: CaseFilters;
  meta: Meta;
  setFilters: (f: CaseFilters) => void;
}

/** Below the split width: the full table. A row opens the case full page, which can come back to this exact list. */
const CaseTable: React.FC<ListProps> = ({ filters, meta, setFilters }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const list = useCaseList(filters);
  return (
    <QueryBoundary
      query={list}
      loadingTip="Loading cases"
      isEmpty={(page) => page.data.length === 0}
      emptyTitle="No cases found"
      emptyDescription={isFiltered(filters) ? 'No case matches these filters. Widen the search or clear the filters.' : 'There are no cases in your scope yet.'}
    >
      {(page) => {
        const state: FromList = { from: location.pathname + location.search, ids: page.data.map((c) => c.id) };
        return (
          <div className="uc-section uc-section-flush">
            <Table<CaseRead>
              rowKey="id"
              dataSource={page.data}
              columns={columns(meta)}
              scroll={{ x: 1000 }}
              sticky={{ offsetHeader: 52 }}
              loading={list.isFetching}
              onRow={(c) => ({ onClick: () => navigate(`/cases/${c.id}`, { state }), style: { cursor: 'pointer' } })}
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
          </div>
        );
      }}
    </QueryBoundary>
  );
};

/**
 * Where the reader was in the split list. It survives the list being re-rendered when the open case
 * changes, so the list never jumps back to the top or drops keyboard focus.
 */
const memory = { search: '', scrollTop: 0, refocus: false };

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.getAttribute('role') === 'combobox');
const inDialog = (el: EventTarget | null) => el instanceof HTMLElement && el.closest('[role="dialog"], .ant-modal-wrap, .ant-select-dropdown, .ant-picker-dropdown') !== null;

/** At the split width: compact rows. J/K or the arrow keys move through them, Enter opens one, Escape comes back here. */
const CaseRows: React.FC<ListProps & { selectedId: number | null; listRef: React.RefObject<HTMLUListElement | null> }> = ({
  filters, setFilters, selectedId, listRef,
}) => {
  const list = useCaseList(filters);
  const [search] = useSearchParams();
  const location = useLocation();
  const rows = list.data?.data ?? [];
  const selectedAt = rows.findIndex((c) => c.id === selectedId);
  const [active, setActive] = useState(Math.max(0, selectedAt));
  useEffect(() => {
    if (selectedAt >= 0) setActive(selectedAt);
  }, [selectedAt]);
  const at = Math.min(active, Math.max(0, rows.length - 1));

  const focusRow = useCallback((i: number) => {
    const links = listRef.current?.querySelectorAll<HTMLAnchorElement>('a[data-row]');
    if (!links || links.length === 0) return;
    const next = Math.max(0, Math.min(i, links.length - 1));
    setActive(next);
    links[next].focus();
  }, [listRef]);

  // J and K work from anywhere on the page except while typing or in a dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented || isTyping(e.target) || inDialog(e.target)) return;
      const inList = listRef.current?.contains(e.target as Node) ?? false;
      const onRow = inList && (e.target as HTMLElement).matches?.('a[data-row]');
      if (e.key === 'j' || e.key === 'J') {
        e.preventDefault();
        focusRow(onRow ? at + 1 : at);
      } else if (e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        focusRow(onRow ? at - 1 : at);
      } else if (e.key === 'Escape' && !inList && (e.target as HTMLElement | null)?.closest?.('.uc-split-detail')) {
        e.preventDefault();
        focusRow(at);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [at, focusRow, listRef]);

  useEffect(() => {
    if (!memory.refocus || selectedAt < 0) return;
    memory.refocus = false;
    listRef.current?.querySelectorAll<HTMLAnchorElement>('a[data-row]')[selectedAt]?.focus({ preventScroll: true });
  }, [selectedAt, listRef]);

  const onListKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); focusRow(at + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); focusRow(at - 1); }
    else if (e.key === 'Home') { e.preventDefault(); focusRow(0); }
    else if (e.key === 'End') { e.preventDefault(); focusRow(rows.length - 1); }
  };

  return (
    <QueryBoundary
      query={list}
      loadingTip="Loading cases"
      isEmpty={(page) => page.data.length === 0}
      emptyTitle="No cases found"
      emptyDescription={isFiltered(filters) ? 'No case matches these filters. Widen the search or clear the filters.' : 'There are no cases in your scope yet.'}
    >
      {(page) => {
        const state: FromList = { from: `/cases${location.search}`, ids: page.data.map((c) => c.id) };
        return (
          <>
            <ul ref={listRef} className="uc-split-rows" aria-label="Cases" onKeyDown={onListKey} aria-busy={list.isFetching}>
              {page.data.map((c, i) => {
                const selected = c.id === selectedId;
                return (
                  <li key={c.id}>
                    <Link
                      data-row
                      to={{ pathname: `/cases/${c.id}`, search: search.toString() ? `?${search.toString()}` : '' }}
                      state={state}
                      tabIndex={i === at ? 0 : -1}
                      aria-current={selected ? 'page' : undefined}
                      className={['uc-split-row', 'uc-pressable', selected ? 'is-selected' : ''].join(' ')}
                      onFocus={() => setActive(i)}
                      onClick={() => {
                        memory.refocus = true;
                      }}
                    >
                      <span className="uc-split-row-top">
                        <span className="uc-ref">{c.case_ref}</span>
                        <SlaBadge ageDays={c.age_days} beyondSla={c.beyond_sla} receivedAt={c.received_at} slaDueOn={c.sla_due_on} status={c.status} />
                      </span>
                      <span className="uc-split-row-inst">{c.institution_name ?? c.raw_institution_text}</span>
                      <span className="uc-split-row-meta">
                        <StatusChip status={c.status} />
                        {c.in_overlap && <OverlapMark />}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            {page.pagination.total_pages > 1 && (
              <div className="uc-split-pager">
                <Pagination
                  size="small"
                  simple
                  showSizeChanger={false}
                  current={page.pagination.page}
                  pageSize={page.pagination.limit}
                  total={page.pagination.total}
                  onChange={(p) => setFilters({ ...filters, page: p })}
                />
              </div>
            )}
          </>
        );
      }}
    </QueryBoundary>
  );
};

/** What the list is, in a line: removable filter tokens, the count, and the order. */
const ListSentence: React.FC<ListProps & { filtersOpen: boolean; onToggleFilters: () => void; panelId: string }> = ({
  filters, meta, setFilters, filtersOpen, onToggleFilters, panelId,
}) => {
  const list = useCaseList(filters);
  const total = list.data?.pagination.total;
  const tokens = filterTokens(filters, meta);
  const m = useMotionPrefs();
  const count = total === undefined ? '' : `${total} ${total === 1 ? 'case' : 'cases'}`;
  return (
    <div className="uc-list-bar">
      <div className="uc-sentence">
        {tokens.length === 0 ? (
          <span className="uc-sentence-text">All cases in your scope{count && ` · ${count}`}</span>
        ) : (
          <>
            <ul className="uc-tokens" aria-label="Active filters">
              {tokens.map((t) => (
                <motion.li key={t.key} layout={m.reduce ? false : 'position'} transition={m.quick}>
                  <button type="button" className="uc-token uc-pressable" onClick={() => setFilters(t.without)} aria-label={`Remove filter: ${t.label}`}>
                    {t.label}
                    <CloseOutlined aria-hidden="true" />
                  </button>
                </motion.li>
              ))}
            </ul>
            {count && <span className="uc-sentence-text">· {count}</span>}
          </>
        )}
        <span role="status" className="uc-sr">{total === undefined ? '' : describeFilters(filters, total, meta)}</span>
      </div>
      <div className="uc-list-controls">
        <label className="uc-sort">
          <span className="uc-meta">Sort</span>
          <Select<CaseSort>
            size="small"
            aria-label="Sort"
            value={filters.sort}
            onChange={(sort) => setFilters({ ...filters, sort, page: 1 })}
            options={(Object.keys(SORT_LABELS) as CaseSort[]).map((k) => ({ value: k, label: SORT_LABELS[k] }))}
            popupMatchSelectWidth={false}
            variant="borderless"
          />
        </label>
        <Button size="small" onClick={onToggleFilters} aria-expanded={filtersOpen} aria-controls={panelId} icon={<DownOutlined className={filtersOpen ? 'uc-chevron is-open' : 'uc-chevron'} aria-hidden="true" />} iconPlacement="end">
          Filters{tokens.length > 0 ? ` (${tokens.length})` : ''}
        </Button>
      </div>
    </div>
  );
};

/** The open case beside the list. It cross-fades in with a small shift, so the change of case is felt, not staged. */
const SplitDetail: React.FC<{ id: number; meta: Meta; listHref: string }> = ({ id, meta, listHref }) => {
  const detail = useCaseDetail(id);
  const m = useMotionPrefs();
  const top = useRef<HTMLDivElement>(null);
  // A new case starts at its header, even if the last one was read far down.
  useEffect(() => {
    const el = top.current;
    if (!el) return;
    const y = el.getBoundingClientRect().top;
    if (y < 0) window.scrollTo({ top: window.scrollY + y - 72 });
  }, [id]);
  return (
    <div ref={top}>
    <QueryBoundary query={detail} loadingTip="Loading case">
      {(d) => (
        <motion.div key={d.case.id} initial={m.reduce ? { opacity: 0 } : { opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={m.quick}>
          <CaseView key={d.case.id} detail={d} meta={meta} listHref={listHref} embedded />
        </motion.div>
      )}
    </QueryBoundary>
    </div>
  );
};

export const CasesPage: React.FC = () => {
  const [search, setSearch] = useSearchParams();
  const filters = parseFilters(search);
  const meta = useMeta();
  const split = useSplitView();
  const outlet = useOutlet();
  const match = useMatch('/cases/:id');
  const selectedId = match && /^\d+$/.test(match.params.id ?? '') ? Number(match.params.id) : null;
  const [filtersOpen, setFiltersOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const navRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (navRef.current && memory.search === search.toString()) navRef.current.scrollTop = memory.scrollTop;
  });
  const setFilters = (next: CaseFilters) => setSearch(toSearch(next));
  const toggleFilters = () => setFiltersOpen((o) => !o);
  useEffect(() => {
    if (filtersOpen) panelRef.current?.querySelector<HTMLInputElement>('input')?.focus();
  }, [filtersOpen]);

  // Narrow screens open a case full page (the nested route), as before.
  if (!split && outlet) return outlet;

  const panelId = 'case-filters';
  const head = (m: Meta) => (
    <>
      <ListSentence filters={filters} meta={m} setFilters={setFilters} filtersOpen={filtersOpen} onToggleFilters={toggleFilters} panelId={panelId} />
      {filtersOpen && (
        <div ref={panelRef}>
          <CaseFilterBar id={panelId} key={search.toString()} filters={filters} meta={m} onApply={setFilters} />
        </div>
      )}
    </>
  );

  if (!split) {
    return (
      <div className="uc-page uc-page--wide">
        <PageHeader title="Cases" subtitle="Search by institution, reference, bureau, region, category, status or date." />
        <QueryBoundary query={meta} loadingTip="Loading filters">
          {(m) => (
            <>
              {head(m)}
              <CaseTable filters={filters} meta={m} setFilters={setFilters} />
            </>
          )}
        </QueryBoundary>
      </div>
    );
  }

  const listHref = `/cases${search.toString() ? `?${search.toString()}` : ''}`;
  return (
    <div className="uc-split-page">
      {selectedId === null ? (
        <PageHeader title="Cases" />
      ) : (
        <div className="uc-split-title" aria-hidden="true">Cases</div>
      )}
      <QueryBoundary query={meta} loadingTip="Loading filters">
        {(m) => (
          <>
            {head(m)}
            <div className="uc-split">
              <nav
                ref={navRef}
                className="uc-split-list"
                aria-label="Case list"
                onScroll={(e) => {
                  memory.search = search.toString();
                  memory.scrollTop = e.currentTarget.scrollTop;
                }}
              >
                <CaseRows filters={filters} meta={m} setFilters={setFilters} selectedId={selectedId} listRef={listRef} />
              </nav>
              <div className="uc-split-detail">
                {selectedId !== null ? (
                  <SplitDetail id={selectedId} meta={m} listHref={listHref} />
                ) : (
                  <div className="uc-split-empty">
                    <p>Choose a case from the list.</p>
                    <p className="uc-meta">
                      <kbd>J</kbd> and <kbd>K</kbd> move through the list, <kbd>Enter</kbd> opens a case, <kbd>Esc</kbd> comes back to the list.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </QueryBoundary>
    </div>
  );
};

export default CasesPage;
