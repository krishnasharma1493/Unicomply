import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { BackLink, PageHeader, Section } from '../components/layout/PageHeader';
import { BureauChip, KpiCard } from '../components/ui';
import { EvidenceSummary, LinkedCaseCard, OverlapBanner, OverlapLanes } from '../components/signature';
import { QueryBoundary } from '../components/states';
import { useInstitution } from '../features/institutions/useInstitutions';
import { INST_TYPE_LABELS, OVERLAP_GROUP_STATUS_LABELS, OVERLAP_LEVEL_LABELS, OVERLAP_TIER_LABELS, REGION_LABELS } from '../lib/api/enums';
import type { Institution360, InstitutionLite, LinkedCaseCard as CardData } from '../lib/api/types';
import '../styles/institutions.css';

const Links: React.FC<{ rows: InstitutionLite[]; empty: string }> = ({ rows, empty }) =>
  rows.length === 0 ? (
    <p className="uc-muted ins-empty">{empty}</p>
  ) : (
    <ul className="uc-rows ins-links">
      {rows.map((r) => (
        <li key={r.permanent_id}>
          <Link to={`/institutions/${r.permanent_id}`}>{r.name}</Link>
          <span className="uc-meta">{r.district}</span>
        </li>
      ))}
    </ul>
  );

const newestFirst = (a: CardData, b: CardData) => b.received_at.localeCompare(a.received_at) || b.case_id - a.case_id;

const View: React.FC<{ data: Institution360 }> = ({ data }) => {
  const { institution: inst, trust, parent, departments, trust_institutions: siblings, case_counts: counts } = data;
  const all = data.cases_by_bureau.flatMap((col) => col.cases);
  // A case in a confirmed group carries its coordinator on every row (PRD §4.2).
  const coordinatorOf = new Map<number, string>();
  for (const g of data.overlap_groups) for (const c of g.cases) if (g.coordinator_name) coordinatorOf.set(c.case_id, g.coordinator_name);

  return (
    <>
      <PageHeader
        title={inst.name}
        titleExtra={<span className="uc-label">{inst.permanent_id}</span>}
        subtitle={`${INST_TYPE_LABELS[inst.inst_type]} · ${inst.district}, ${inst.state} · ${REGION_LABELS[inst.region]} region`}
      />
      <div className="uc-kpis ins-kpis" role="group" aria-label="Case counts">
        <KpiCard label="Cases" value={counts.total} />
        <KpiCard label="Open" value={counts.open} />
        <KpiCard label="Disposed" value={counts.disposed} />
        <KpiCard label="Beyond SLA" value={counts.beyond_sla} className={counts.beyond_sla > 0 ? 'uc-kpi--alert' : undefined} />
      </div>

      <div className="ins-layout">
        <Section title="Cases at this institution" className="ins-cases">
          {all.length === 0 ? (
            <p className="uc-muted ins-empty">No case has been reported about this institution.</p>
          ) : (
            <div className="ins-cases-body">
              <OverlapLanes cases={all} caption={`Cases at ${inst.name}, one lane per bureau`} />

              {data.overlap_groups.length > 0 && (
                <div className="ins-overlaps">
                  {data.overlap_groups.map((g) => (
                    <section
                      key={g.group_id}
                      className="ins-overlap"
                      aria-label={`Overlap group ${g.group_id}: ${OVERLAP_TIER_LABELS[g.tier]}, ${OVERLAP_LEVEL_LABELS[g.level].toLowerCase()}`}
                    >
                      <OverlapBanner
                        tier={g.tier}
                        groupId={g.group_id}
                        caseCount={g.cases.length}
                        bureauCodes={Array.from(new Set(g.cases.map((c) => c.bureau_code)))}
                      />
                      <p className="uc-meta ins-overlap-meta">
                        {OVERLAP_LEVEL_LABELS[g.level]} · {OVERLAP_GROUP_STATUS_LABELS[g.status]}
                        {g.coordinator_name ? ` · Coordinator: ${g.coordinator_name}` : ''}
                        {' · '}
                        <span className="uc-ref">{g.cases.map((c) => c.case_ref).join(', ')}</span>
                      </p>
                      <EvidenceSummary reasons={g.reasons} title="Why flagged, for this group" />
                    </section>
                  ))}
                </div>
              )}

              <div className="ins-bureaus">
                {data.cases_by_bureau.map((col) => (
                  <div key={col.bureau_id} role="group" aria-label={`Cases at ${col.bureau_code}`} className="ins-bureau">
                    <h3 className="ins-bureau-head">
                      <BureauChip code={col.bureau_code} name={col.bureau_name} />
                      <span>{col.bureau_name}</span>
                      <span className="uc-meta uc-num">
                        {col.cases.length} {col.cases.length === 1 ? 'case' : 'cases'}
                      </span>
                    </h3>
                    <ul className="uc-rows">
                      {[...col.cases].sort(newestFirst).map((c) => (
                        <li key={c.case_id}>
                          <LinkedCaseCard card={c} coordinatorName={coordinatorOf.get(c.case_id)} />
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Section>

        <aside className="ins-side" aria-label="About this institution">
          <Section title="Profile">
            <dl className="ins-fields">
              <div>
                <dt>Established</dt>
                <dd className="uc-num">{inst.year_est ?? 'Not recorded'}</dd>
              </div>
              <div>
                <dt>Address</dt>
                <dd>
                  {inst.address}, {inst.district}, {inst.state} <span className="uc-num">{inst.pin}</span>
                </dd>
              </div>
              <div>
                <dt>Trust</dt>
                <dd>{trust ? trust.name : 'Not run by a trust'}</dd>
              </div>
              <div>
                <dt>Part of</dt>
                <dd>{parent ? <Link to={`/institutions/${parent.permanent_id}`}>{parent.name}</Link> : 'Independent'}</dd>
              </div>
            </dl>
          </Section>
          <Section title={trust ? `Other institutions of ${trust.name}` : 'Trust'}>
            <Links rows={siblings} empty={trust ? 'This trust runs no other institution.' : 'Not run by a trust.'} />
          </Section>
          <Section title="Departments">
            <Links rows={departments} empty="No departments." />
          </Section>
        </aside>
      </div>
    </>
  );
};

export const InstitutionDetailPage: React.FC = () => {
  const { pid = '' } = useParams();
  const detail = useInstitution(pid);
  return (
    <div className="uc-page">
      <BackLink to="/institutions" label="Institutions" />
      <div>
        <QueryBoundary query={detail} loadingTip="Loading institution">
          {(d) => <View data={d} />}
        </QueryBoundary>
      </div>
    </div>
  );
};

export default InstitutionDetailPage;
