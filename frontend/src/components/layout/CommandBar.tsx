import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input, Modal, type InputRef } from 'antd';
import { BankOutlined, FileTextOutlined, RightOutlined, SearchOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../auth/AuthProvider';
import { client } from '../../lib/api/client';
import type { CaseRead, InstitutionListItem, Page } from '../../lib/api/types';
import { useDebouncedValue } from '../../features/intake/useDebouncedValue';
import { NAV_ITEMS } from './AppSidebar';
import { announce } from '../../lib/announce';

interface Result {
  key: string;
  group: 'Go to' | 'Cases' | 'Institutions';
  label: string;
  detail?: string;
  to: string;
  icon: React.ReactNode;
}

/** A case reference looks like PGRC/2026/00412: search it exactly; anything else is free text. */
const looksLikeRef = (t: string) => /\//.test(t) || /^[a-z-]+\d/i.test(t);

/**
 * Jump anywhere by keyboard: a page, a case by reference or institution, an institution by name or
 * Permanent ID. Opened with ⌘K / Ctrl K or the toolbar's search field. Everything it finds goes
 * through the same scoped endpoints as the pages, so it never shows what the user may not open.
 */
export const CommandBar: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [term, setTerm] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<InputRef>(null);
  const q = useDebouncedValue(term.trim(), 200);

  const cases = useQuery<Page<CaseRead>>({
    queryKey: ['command', 'cases', q],
    enabled: open && q.length >= 2,
    retry: false,
    queryFn: async ({ signal }) =>
      (
        await client.get<Page<CaseRead>>('/cases', {
          params: looksLikeRef(q) && q.includes('/') ? { case_ref: q, limit: 5 } : { q, limit: 5 },
          signal,
        })
      ).data,
  });
  const institutions = useQuery<Page<InstitutionListItem>>({
    queryKey: ['command', 'institutions', q],
    enabled: open && q.length >= 2 && !q.includes('/'),
    retry: false,
    queryFn: async ({ signal }) => (await client.get<Page<InstitutionListItem>>('/institutions', { params: { q, limit: 5 }, signal })).data,
  });

  const results: Result[] = useMemo(() => {
    const t = term.trim().toLowerCase();
    const pages: Result[] = NAV_ITEMS.filter((n) => n.visible(user?.role, user?.is_admin))
      .filter((n) => !t || n.label.toLowerCase().includes(t))
      .map((n) => ({ key: `page:${n.path}`, group: 'Go to', label: n.label, to: n.path, icon: n.icon }));
    const caseRows: Result[] = (q.length >= 2 ? cases.data?.data ?? [] : []).map((c) => ({
      key: `case:${c.id}`,
      group: 'Cases',
      label: c.case_ref,
      detail: `${c.institution_name ?? c.raw_institution_text} · ${c.subject}`,
      to: `/cases/${c.id}`,
      icon: <FileTextOutlined />,
    }));
    const instRows: Result[] = (q.length >= 2 ? institutions.data?.data ?? [] : []).map((i) => ({
      key: `inst:${i.permanent_id}`,
      group: 'Institutions',
      label: i.name,
      detail: `${i.permanent_id} · ${i.district}, ${i.state}`,
      to: `/institutions/${i.permanent_id}`,
      icon: <BankOutlined />,
    }));
    return [...caseRows, ...instRows, ...pages].slice(0, 14);
  }, [term, q, cases.data, institutions.data, user]);

  useEffect(() => setActive(0), [term]);
  // Say how many results there are once a search settles, so a screen-reader user knows what is below.
  useEffect(() => {
    if (!open || q.length < 2 || cases.isFetching || institutions.isFetching) return;
    announce(results.length ? `${results.length} results` : 'Nothing matches');
  }, [open, q, cases.isFetching, institutions.isFetching, results.length]);
  useEffect(() => {
    if (!open) setTerm('');
  }, [open]);

  const go = (r: Result | undefined) => {
    if (!r) return;
    onClose();
    navigate(r.to);
  };

  const searching = q.length >= 2 && (cases.isFetching || institutions.isFetching);
  let lastGroup = '';

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      closable={false}
      width={600}
      className="uc-command"
      style={{ top: '12vh' }}
      afterOpenChange={(o) => o && input.current?.focus()}
      destroyOnHidden
      title={<span className="uc-sr">Search and jump</span>}
    >
      <Input
        ref={input}
        size="large"
        variant="borderless"
        prefix={<SearchOutlined aria-hidden="true" />}
        placeholder="Case reference, institution, Permanent ID or page"
        aria-label="Search cases, institutions and pages"
        role="combobox"
        aria-expanded={results.length > 0}
        aria-autocomplete="list"
        aria-controls="uc-command-results"
        aria-activedescendant={results[active] ? `uc-cmd-${active}` : undefined}
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, results.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            go(results[active]);
          }
        }}
      />
      <ul id="uc-command-results" role="listbox" aria-label="Results" className="uc-command-list">
        {results.map((r, i) => {
          const heading = r.group !== lastGroup ? r.group : null;
          lastGroup = r.group;
          return (
            <React.Fragment key={r.key}>
              {heading && (
                <li role="presentation" className="uc-command-group">
                  {heading}
                </li>
              )}
              <li
                id={`uc-cmd-${i}`}
                role="option"
                aria-selected={i === active}
                className={i === active ? 'uc-command-item is-active' : 'uc-command-item'}
                onMouseMove={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => go(r)}
              >
                <span className="uc-command-icon" aria-hidden="true">{r.icon}</span>
                <span className="uc-command-text">
                  <span className={r.group === 'Cases' ? 'uc-ref' : undefined}>{r.label}</span>
                  {r.detail && <span className="uc-meta">{r.detail}</span>}
                </span>
                <RightOutlined className="uc-command-go" aria-hidden="true" />
              </li>
            </React.Fragment>
          );
        })}
        {results.length === 0 && (
          <li role="presentation" className="uc-command-empty">
            {searching ? 'Searching…' : 'Nothing matches. Try a case reference such as PGRC/2026/00412, or part of an institution name.'}
          </li>
        )}
      </ul>
      <div className="uc-command-foot uc-meta" aria-hidden="true">
        <span><kbd>↑</kbd> <kbd>↓</kbd> to move</span>
        <span><kbd>Enter</kbd> to open</span>
        <span><kbd>Esc</kbd> to close</span>
      </div>
    </Modal>
  );
};

/** ⌘K / Ctrl K anywhere opens the command bar. */
export function useCommandShortcut(onOpen: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpen();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onOpen]);
}
