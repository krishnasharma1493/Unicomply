import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  StatusChip,
  BureauChip,
  TierChip,
  SlaBadge,
  KpiCard,
} from '../components/ui';
import {
  LoadingState,
  EmptyState,
  ErrorState,
  QueryBoundary,
} from '../components/states';
import { CASE_STATUSES } from '../lib/api/enums';
import { AppRoutes } from '../App';
import { AuthProvider } from '../auth/AuthProvider';

describe('UI Primitives (Issue #9)', () => {
  describe('StatusChip', () => {
    it('renders readable text for all 7 case statuses, pairing colour with text', () => {
      const { rerender } = render(<StatusChip status="received" />);
      expect(screen.getByText('Received')).toBeInTheDocument();

      const expectedLabels: Record<string, string> = {
        received: 'Received',
        under_process: 'Under process',
        interim_reply: 'Interim reply',
        transferred: 'Transferred',
        escalated: 'Escalated',
        reopened: 'Reopened',
        disposed: 'Disposed',
      };

      for (const status of CASE_STATUSES) {
        rerender(<StatusChip status={status} />);
        expect(screen.getByText(expectedLabels[status])).toBeInTheDocument();
      }
    });
  });

  describe('BureauChip', () => {
    it('renders bureau code text with kind-based colour scheme', () => {
      const { rerender } = render(<BureauChip code="PGRC" kind="bureau" />);
      expect(screen.getByText('PGRC')).toBeInTheDocument();

      rerender(<BureauChip code="RO-CRO" kind="regional_office" />);
      expect(screen.getByText('RO-CRO')).toBeInTheDocument();
    });

    it('renders with kind label when showKind is true', () => {
      render(<BureauChip code="PGRC" kind="bureau" showKind />);
      expect(screen.getByText('PGRC · Bureau')).toBeInTheDocument();
    });
  });

  describe('TierChip', () => {
    it('renders text for both probable and possible overlap tiers', () => {
      const { rerender } = render(<TierChip tier="probable" />);
      expect(screen.getByText('Probable')).toBeInTheDocument();

      rerender(<TierChip tier="possible" />);
      expect(screen.getByText('Possible')).toBeInTheDocument();
    });
  });

  describe('SlaBadge', () => {
    it('renders neutral badge on Day 16 of 21', () => {
      render(<SlaBadge ageDays={16} totalSlaDays={21} />);
      const badge = screen.getByText('Day 16 of 21');
      expect(badge).toBeInTheDocument();
      // Ant Design default tag does not have ant-tag-warning or ant-tag-error
      expect(badge).not.toHaveClass('ant-tag-warning');
      expect(badge).not.toHaveClass('ant-tag-error');
    });

    it('renders amber warning badge starting on Day 17 of 21', () => {
      render(<SlaBadge ageDays={17} totalSlaDays={21} />);
      const badge = screen.getByText('Day 17 of 21');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveClass('ant-tag-warning');
    });

    it('renders amber warning badge on Day 21 of 21 (due day itself)', () => {
      render(<SlaBadge ageDays={21} totalSlaDays={21} />);
      const badge = screen.getByText('Day 21 of 21');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveClass('ant-tag-warning');
    });

    it('renders red breached badge on Day 22 (Beyond SLA +1)', () => {
      render(<SlaBadge ageDays={22} totalSlaDays={21} />);
      const badge = screen.getByText('Beyond SLA +1');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveClass('ant-tag-error');
    });

    it('renders red breached badge on Day 24 (Beyond SLA +3)', () => {
      render(<SlaBadge ageDays={24} totalSlaDays={21} />);
      const badge = screen.getByText('Beyond SLA +3');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveClass('ant-tag-error');
    });

    it('supports custom SLA lengths (e.g. 15-day SLA)', () => {
      // 15 days total: warning at 15 - 4 = 11
      const { rerender } = render(<SlaBadge ageDays={10} totalSlaDays={15} />);
      expect(screen.getByText('Day 10 of 15')).not.toHaveClass('ant-tag-warning');

      rerender(<SlaBadge ageDays={11} totalSlaDays={15} />);
      expect(screen.getByText('Day 11 of 15')).toHaveClass('ant-tag-warning');

      rerender(<SlaBadge ageDays={15} totalSlaDays={15} />);
      expect(screen.getByText('Day 15 of 15')).toHaveClass('ant-tag-warning');

      rerender(<SlaBadge ageDays={16} totalSlaDays={15} />);
      expect(screen.getByText('Beyond SLA +1')).toHaveClass('ant-tag-error');
    });

    it('derives total from receivedAt and slaDueOn calendar difference', () => {
      // received 2026-11-01, due 2026-11-16 = 15 days total
      render(
        <SlaBadge
          receivedAt="2026-11-01"
          slaDueOn="2026-11-16"
          ageDays={12}
        />,
      );
      expect(screen.getByText('Day 12 of 15')).toBeInTheDocument();
    });

    it('renders Closed for disposed cases regardless of age', () => {
      render(<SlaBadge status="disposed" ageDays={30} />);
      expect(screen.getByText('Closed')).toBeInTheDocument();
    });

    it('respects beyondSla boolean flag from API directly', () => {
      render(<SlaBadge ageDays={21} beyondSla={true} totalSlaDays={21} />);
      expect(screen.getByText(/Beyond SLA \+1/)).toHaveClass('ant-tag-error');
    });
  });

  describe('KpiCard', () => {
    it('renders label and value', () => {
      render(<KpiCard label="Pending Cases" value={42} />);
      expect(screen.getByText('Pending Cases')).toBeInTheDocument();
      expect(screen.getByText('42')).toBeInTheDocument();
    });

    it('renders delta indicator when provided', () => {
      render(
        <KpiCard
          label="Total Cases"
          value={100}
          delta={{ value: '15%', isPositive: true, label: 'vs last month' }}
        />,
      );
      expect(screen.getByText(/15%/)).toBeInTheDocument();
      expect(screen.getByText('vs last month')).toBeInTheDocument();
    });

    it('calls onClick when clicked or activated with keyboard', () => {
      const handleClick = vi.fn();
      render(<KpiCard label="Clickable" value={10} onClick={handleClick} />);

      const card = screen.getByRole('button');
      fireEvent.click(card);
      expect(handleClick).toHaveBeenCalledTimes(1);

      fireEvent.keyDown(card, { key: 'Enter' });
      expect(handleClick).toHaveBeenCalledTimes(2);
    });
  });

  describe('Page States', () => {
    it('LoadingState renders spinner and custom tip', () => {
      render(<LoadingState tip="Loading cases..." />);
      expect(screen.getByText('Loading cases...')).toBeInTheDocument();
      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('EmptyState renders title and description', () => {
      render(<EmptyState title="No items" description="Check back later." />);
      expect(screen.getByText('No items')).toBeInTheDocument();
      expect(screen.getByText('Check back later.')).toBeInTheDocument();
    });

    it('ErrorState renders message as plain text and triggers onRetry', () => {
      const handleRetry = vi.fn();
      render(
        <ErrorState
          error={new Error('Database unavailable')}
          onRetry={handleRetry}
        />,
      );
      expect(screen.getByText('Database unavailable')).toBeInTheDocument();
      expect(screen.queryByText(/<script>/)).not.toBeInTheDocument();

      const retryBtn = screen.getByRole('button', { name: /try again/i });
      fireEvent.click(retryBtn);
      expect(handleRetry).toHaveBeenCalledTimes(1);
    });

    describe('QueryBoundary', () => {
      it('renders LoadingState when query is loading', () => {
        render(
          <QueryBoundary
            query={{ isLoading: true, isError: false }}
            loadingTip="Fetching data..."
          >
            {() => <div>Loaded Content</div>}
          </QueryBoundary>,
        );
        expect(screen.getByText('Fetching data...')).toBeInTheDocument();
      });

      it('renders ErrorState when query has error', () => {
        render(
          <QueryBoundary
            query={{
              isLoading: false,
              isError: true,
              error: new Error('Failed to load'),
            }}
          >
            {() => <div>Loaded Content</div>}
          </QueryBoundary>,
        );
        expect(screen.getByText('Failed to load')).toBeInTheDocument();
      });

      it('renders EmptyState when data array is empty', () => {
        render(
          <QueryBoundary
            query={{ isLoading: false, isError: false, data: [] }}
            emptyTitle="No records"
          >
            {() => <div>Loaded Content</div>}
          </QueryBoundary>,
        );
        expect(screen.getByText('No records')).toBeInTheDocument();
      });

      it('renders children when data is successfully populated', () => {
        render(
          <QueryBoundary
            query={{ isLoading: false, isError: false, data: ['Case 1'] }}
          >
            {(data) => <div>Loaded: {data.join(', ')}</div>}
          </QueryBoundary>,
        );
        expect(screen.getByText('Loaded: Case 1')).toBeInTheDocument();
      });
    });
  });

  describe('Dev Route (/dev/primitives)', () => {
    it('renders the PrimitivesDevPage when navigating to /dev/primitives', () => {
      const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      render(
        <QueryClientProvider client={qc}>
          <AuthProvider>
            <MemoryRouter initialEntries={['/dev/primitives']}>
              <AppRoutes />
            </MemoryRouter>
          </AuthProvider>
        </QueryClientProvider>,
      );

      expect(screen.getByText('UI Primitives Gallery')).toBeInTheDocument();
      expect(screen.getByText(/StatusChip \(All 7 Case Statuses\)/)).toBeInTheDocument();
    });
  });
});
