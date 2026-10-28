import React from 'react';
import { animate } from 'motion/react';
import type { Candidate } from '../../lib/api/types';
import { CandidateList, type CandidateListProps } from '../../components/signature';
import { FADE, SPRING, SPRING_QUICK } from '../../lib/motion';

type Controls = ReturnType<typeof animate>;

interface Props extends CandidateListProps {
  /** Under reduced motion a re-rank is a cross-fade of the rows that arrive, with no movement. */
  reduce: boolean;
}

/**
 * The shared CandidateList, re-ranked in place. As the operator types the order can change; each row
 * (keyed by Permanent ID, so React keeps its node) springs from where it was on screen to its new rank,
 * and a row that is new to the list fades in instead of popping. The "from" position is read before React
 * commits (getSnapshotBeforeUpdate), including any spring still in flight, so a re-rank that lands while
 * the last one is moving starts from what the operator sees: the motion is interruptible.
 */
export class RerankingCandidates extends React.Component<Props> {
  private root = React.createRef<HTMLDivElement>();
  private running = new Map<string, Controls>();

  private rows(): HTMLElement[] {
    return Array.from(this.root.current?.querySelectorAll<HTMLElement>(':scope > ol > li') ?? []);
  }

  getSnapshotBeforeUpdate(prev: Props): Map<string, number> {
    const tops = new Map<string, number>();
    this.rows().forEach((li, i) => {
      const id = prev.candidates[i]?.permanent_id;
      if (id) tops.set(id, li.getBoundingClientRect().top);
    });
    return tops;
  }

  componentDidUpdate(_prev: Props, _state: unknown, before: Map<string, number>) {
    const { candidates, reduce } = this.props;
    const rows = this.rows();
    if (rows.length === 0) return;
    // Settle every row at its new layout position first, then measure.
    rows.forEach((li, i) => {
      const id = candidates[i]?.permanent_id;
      if (!id) return;
      this.running.get(id)?.stop();
      li.style.transform = '';
    });
    rows.forEach((li, i) => {
      const c: Candidate | undefined = candidates[i];
      if (!c) return;
      const from = before.get(c.permanent_id);
      if (from === undefined) {
        if (before.size > 0) this.running.set(c.permanent_id, animate(li, { opacity: [0, 1] }, reduce ? FADE : SPRING_QUICK));
        return;
      }
      const dy = from - li.getBoundingClientRect().top;
      if (!reduce && Math.abs(dy) > 0.5) this.running.set(c.permanent_id, animate(li, { y: [dy, 0] }, SPRING));
    });
  }

  componentWillUnmount() {
    this.running.forEach((c) => c.stop());
  }

  render() {
    const { reduce: _reduce, ...list } = this.props;
    return (
      <div ref={this.root} className="uc-rerank">
        <CandidateList {...list} />
      </div>
    );
  }
}

export default RerankingCandidates;
