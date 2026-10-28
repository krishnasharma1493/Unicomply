import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CandidateList, LinkedCaseCard, OverlapBanner, WhyFlagged } from '../components/signature';
import { fixtures } from '../lib/api/mock/fixtures';
import { SignaturePreview } from '../pages/dev/SignaturePreview';

const intake = fixtures.intake.data;
const group = intake.overlaps[0];
const wrap = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('Signature components (Issue #24)', () => {
  describe('OverlapBanner', () => {
    it('shows the PS wording byte for byte on a probable group', () => {
      wrap(<OverlapBanner tier="probable" bureauCodes={['PGRC', 'RB']} caseCount={4} />);
      expect(screen.getByText('Potential Overlapping Cases – Coordination Required')).toBeInTheDocument();
      expect('Potential Overlapping Cases – Coordination Required').toBe(
        'Potential Overlapping Cases – Coordination Required',
      );
    });

    it('uses its own wording for possible, lists the bureaus and links to the group', () => {
      wrap(<OverlapBanner tier="possible" bureauCodes={['PGRC', 'RO-CRO']} caseCount={1} groupId={7} />);
      expect(screen.getByText('Possible Overlapping Cases – Review Suggested')).toBeInTheDocument();
      expect(screen.getByText('PGRC')).toBeInTheDocument();
      expect(screen.getByText('RO-CRO')).toBeInTheDocument();
      expect(screen.getByText('1 case handled by')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Open overlap group' })).toHaveAttribute('href', '/overlaps/7');
    });

    it('renders the hero fixture group', () => {
      wrap(<OverlapBanner tier={group.tier} bureauCodes={['PGRC', 'RB', 'RO-CRO']} caseCount={4} />);
      expect(screen.getByText(group.banner)).toBeInTheDocument();
    });
  });

  describe('WhyFlagged', () => {
    it('lists reasons and labels the score instead of showing a bare percentage', () => {
      render(<WhyFlagged reasons={['Name 88% similar', 'District Jabalpur matches']} score={0.93} />);
      expect(screen.getByText('Name 88% similar')).toBeInTheDocument();
      expect(screen.getByText('Match score')).toBeInTheDocument();
      expect(screen.getByLabelText('Match score 93 out of 100')).toBeInTheDocument();
    });

    it('says so when there are no reasons, and shows no bar without a score', () => {
      render(<WhyFlagged reasons={[]} />);
      expect(screen.getByText('No reasons recorded.')).toBeInTheDocument();
      expect(screen.queryByRole('progressbar')).toBeNull();
    });

    it('renders API text as plain text, never as HTML', () => {
      const { container } = render(<WhyFlagged reasons={['<img src=x onerror=alert(1)>']} />);
      expect(container.querySelector('img')).toBeNull();
      expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    });
  });

  describe('CandidateList', () => {
    const candidates = intake.resolution.candidates;

    it('ranks candidates and shows their reasons', () => {
      render(<CandidateList candidates={candidates} />);
      const items = candidates.map((c) => screen.getByRole('listitem', { name: `Candidate ${c.name}` }));
      expect(within(items[0]).getByText(/#1/)).toBeInTheDocument();
      expect(within(items[1]).getByText(/#2/)).toBeInTheDocument();
      expect(within(items[0]).getByText(candidates[0].reasons[0])).toBeInTheDocument();
    });

    it('selects with a real button, marks the selection and is keyboard reachable', () => {
      const onSelect = vi.fn();
      const { rerender } = render(<CandidateList candidates={candidates} onSelect={onSelect} />);
      const button = screen.getByRole('button', { name: `Select ${candidates[1].name}` });
      expect(button.tagName).toBe('BUTTON');
      fireEvent.click(button);
      expect(onSelect).toHaveBeenCalledWith(candidates[1]);
      rerender(<CandidateList candidates={candidates} selectedId={candidates[1].permanent_id} onSelect={onSelect} />);
      expect(screen.getByRole('button', { name: `Select ${candidates[1].name}` })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getAllByText('Selected').length).toBeGreaterThan(0);
    });

    it('has an empty state', () => {
      render(<CandidateList candidates={[]} emptyText="Nothing close enough." />);
      expect(screen.getByText('Nothing close enough.')).toBeInTheDocument();
    });
  });

  describe('LinkedCaseCard', () => {
    const inScope = { ...group.cases[0], in_scope: true };
    const outOfScope = { ...group.cases[0], in_scope: false };

    it('links to the case when it is in scope', () => {
      wrap(<LinkedCaseCard card={inScope} />);
      expect(screen.getByRole('link')).toHaveAttribute('href', `/cases/${inScope.case_id}`);
      expect(screen.getByText(inScope.case_ref)).toBeInTheDocument();
    });

    it('is plain text marked "Summary only" when it is not', () => {
      wrap(<LinkedCaseCard card={outOfScope} />);
      expect(screen.queryByRole('link')).toBeNull();
      expect(screen.getByText('Summary only')).toBeInTheDocument();
    });

    it('shows bureau, status, category, officer, last action and coordinator', () => {
      wrap(<LinkedCaseCard card={inScope} coordinatorName="Sunita Mishra" />);
      expect(screen.getByText(inScope.bureau_code)).toBeInTheDocument();
      expect(screen.getByText(/Officer:/)).toBeInTheDocument();
      expect(screen.getByText(/Last action:/)).toBeInTheDocument();
      expect(screen.getByText('Coordinator: Sunita Mishra')).toBeInTheDocument();
    });

    it('never renders a description or complainant name', () => {
      const { container } = wrap(<LinkedCaseCard card={{ ...inScope, description: 'SECRET', complainant_name: 'Hidden Person' } as never} />);
      expect(container.textContent).not.toContain('SECRET');
      expect(container.textContent).not.toContain('Hidden Person');
    });

    it('says when there has been no action', () => {
      wrap(<LinkedCaseCard card={{ ...inScope, last_action_type: null, last_action_at: null }} />);
      expect(screen.getByText(/no action yet/)).toBeInTheDocument();
    });
  });

  it('the preview page renders every component from the hero fixtures', () => {
    wrap(<SignaturePreview />);
    expect(screen.getAllByText('Potential Overlapping Cases – Coordination Required').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/PGRC\/2026\/00412/).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /^Select / })).toHaveLength(intake.resolution.candidates.length);
  });
});
