import React from 'react';
import { Link } from 'react-router-dom';
import { LeftOutlined } from '@ant-design/icons';

export interface PageHeaderProps {
  title: React.ReactNode;
  /** One line on what the page is for; capped at a readable measure. */
  subtitle?: React.ReactNode;
  /** Where "back" goes, for pages one level down. */
  back?: { to: string; label: string };
  /** Page-level actions, aligned to the end of the title row. */
  actions?: React.ReactNode;
  /** Status chips and similar, set on the title line. */
  titleExtra?: React.ReactNode;
}

/**
 * The way back up one level. Detail pages render it outside their loading boundary, so a loading,
 * missing or out-of-scope record still has a way out.
 */
export const BackLink: React.FC<{ to: string; label: string }> = ({ to, label }) => (
  <Link to={to} className="uc-back">
    <LeftOutlined style={{ fontSize: 11 }} aria-hidden="true" />
    {label}
  </Link>
);

/** Every page answers "where am I" the same way: back link, title, purpose, actions. */
export const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle, back, actions, titleExtra }) => (
  <>
    {back && <BackLink to={back.to} label={back.label} />}
    <header className="uc-page-header">
      <div style={{ minWidth: 0 }}>
        <div className="uc-title-line">
          <h1>{title}</h1>
          {titleExtra}
        </div>
        {subtitle && <p className="uc-page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="uc-page-actions">{actions}</div>}
    </header>
  </>
);

export interface SectionProps {
  title?: React.ReactNode;
  extra?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Body padding off, for tables and lists that run edge to edge. */
  flush?: boolean;
  'aria-label'?: string;
}

/** One solid content surface, one level deep. Rows inside it are separated by hairlines, never boxed. */
export const Section: React.FC<SectionProps> = ({ title, extra, children, className, flush = false, ...rest }) => (
  <section className={['uc-section', className].filter(Boolean).join(' ')} aria-label={rest['aria-label']}>
    {(title || extra) && (
      <div className="uc-section-head">
        {title && <h2 className="uc-section-title">{title}</h2>}
        {extra}
      </div>
    )}
    <div className={flush ? 'uc-section-flush' : 'uc-section-body'}>{children}</div>
  </section>
);
