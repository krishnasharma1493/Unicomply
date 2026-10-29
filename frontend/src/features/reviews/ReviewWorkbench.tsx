import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Input } from 'antd';
import { CheckCircleFilled } from '@ant-design/icons';
import { CandidateList, ResolutionLine } from '../../components/signature';
import { ErrorState } from '../../components/states';
import { client } from '../../lib/api/client';
import type { ApiError, Envelope, ReviewDecideIn, ReviewDecideResult, ReviewItem } from '../../lib/api/types';
import { apiErrorMessage, formatDate } from '../../lib/format';
import { reviewsKey, SEARCH_MIN_CHARS, useRegistrySearch } from './useReviews';

interface Choice {
  permanent_id: string;
  name: string;
}

/**
 * One review: the complaint's own words and, once a choice is made, the line from them to the registry
 * institution; then the engine's candidates, a registry search, and the decision.
 */
export const ReviewWorkbench: React.FC<{
  review: ReviewItem;
  onDecided: (result: ReviewDecideResult, choice: Choice | null) => void;
  /** Someone else settled it first. The item is about to leave the queue, so the page (not this panel) tells the user. */
  onAlreadyDecided: (message: string) => void;
}> = ({ review, onDecided, onAlreadyDecided }) => {
  const queryClient = useQueryClient();
  const [choice, setChoice] = useState<Choice | null>(null);
  const [term, setTerm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const search = useRegistrySearch(term);

  const decide = useMutation({
    mutationFn: async (body: ReviewDecideIn) =>
      (await client.post<Envelope<ReviewDecideResult>>(`/reviews/${review.id}/decide`, body)).data.data,
    onSuccess: async (result, body) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: reviewsKey }),
        queryClient.invalidateQueries({ queryKey: ['cases'] }),
        queryClient.invalidateQueries({ queryKey: ['overlaps'] }),
      ]);
      onDecided(result, 'permanent_id' in body ? choice : null);
    },
    onError: async (e) => {
      if ((e as { response?: { data?: ApiError } }).response?.data?.error.code === 'ALREADY_DECIDED') {
        onAlreadyDecided(`${review.case_ref}: ${apiErrorMessage(e)}. It has been removed from your queue.`);
        await queryClient.invalidateQueries({ queryKey: reviewsKey });
        return;
      }
      setError(apiErrorMessage(e));
    },
  });

  const where = [review.raw_district, review.raw_state].filter(Boolean).join(', ');
  const fromSuggestions = choice && review.candidates.some((c) => c.permanent_id === choice.permanent_id);

  return (
    <section className="uc-section uc-review-work" aria-labelledby="review-work-title">
      <div className="uc-section-head">
        <h2 className="uc-section-title" id="review-work-title">
          Review <span className="uc-ref">{review.case_ref}</span>
        </h2>
        <Link to={`/cases/${review.case_id}`} className="uc-meta-link">Open the case</Link>
      </div>
      <div className="uc-section-body">
        <header className="uc-review-head">
          <span className="uc-meta">As written in the complaint, received {formatDate(review.received_at)}</span>
          <h3 className="uc-review-raw">{review.raw_institution_text}</h3>
          <p className="uc-meta uc-review-where">{where || 'No state or district given'}</p>
          <p className="uc-review-subject">{review.subject}</p>
          <div className="uc-review-resline">
            {choice ? (
              <ResolutionLine
                raw={review.raw_institution_text}
                name={choice.name}
                permanentId={choice.permanent_id}
                note={fromSuggestions ? 'Your choice from the suggestions' : 'Your choice from the registry search'}
              />
            ) : review.candidates[0] ? (
              // Before a choice, show what the engine's best guess would mean, labelled as not yet linked.
              <ResolutionLine
                raw={review.raw_institution_text}
                name={review.candidates[0].name}
                permanentId={review.candidates[0].permanent_id}
                note="Best suggestion, not linked yet. Pick it below, choose another, or search the registry."
              />
            ) : (
              <p className="uc-meta" style={{ margin: 0 }}>Not linked yet. Pick a suggested institution or search the registry.</p>
            )}
          </div>
        </header>

        {error && <Alert type="error" showIcon title={error} style={{ marginTop: 16 }} />}

        <div className="uc-review-part">
          <h3 className="uc-subhead">Suggested institutions</h3>
          {review.candidates.length === 0 ? (
            <p className="uc-muted" style={{ margin: 0 }}>The engine found no candidates. Search the registry below.</p>
          ) : (
            <CandidateList
              candidates={review.candidates}
              selectedId={choice?.permanent_id ?? null}
              onSelect={(c) => setChoice({ permanent_id: c.permanent_id, name: c.name })}
            />
          )}
        </div>

        <div className="uc-review-part">
          <h3 className="uc-subhead" id="review-search-title">Search the registry</h3>
          <Input.Search
            aria-label="Search the registry"
            placeholder="Institution name or Permanent ID"
            allowClear
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
          <div className="uc-review-results">
            {term.trim().length < SEARCH_MIN_CHARS ? null : search.isFetching && !search.data ? (
              <p role="status" className="uc-meta" style={{ margin: 0 }}>Searching</p>
            ) : search.isError ? (
              <ErrorState message={apiErrorMessage(search.error)} onRetry={() => void search.refetch()} style={{ padding: 0 }} />
            ) : (search.data?.data ?? []).length === 0 ? (
              <p className="uc-muted" style={{ margin: 0 }}>No institution matches that search.</p>
            ) : (
              <ul className="uc-rows" aria-label="Registry results">
                {(search.data?.data ?? []).map((inst) => {
                  const picked = choice?.permanent_id === inst.permanent_id;
                  return (
                    <li key={inst.permanent_id} className="uc-review-hit">
                      <div>
                        <strong>{inst.name}</strong>
                        <div className="uc-meta">{inst.permanent_id} · {inst.district}, {inst.state}</div>
                      </div>
                      <Button
                        size="small"
                        aria-label={`Pick ${inst.name}`}
                        aria-pressed={picked}
                        type={picked ? 'primary' : 'default'}
                        icon={picked ? <CheckCircleFilled /> : undefined}
                        onClick={() => setChoice({ permanent_id: inst.permanent_id, name: inst.name })}
                      >
                        {picked ? 'Picked' : 'Pick'}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <div className="uc-review-decide">
          <Button
            type="primary"
            disabled={!choice}
            loading={decide.isPending}
            onClick={() => choice && decide.mutate({ permanent_id: choice.permanent_id })}
          >
            {choice ? `Link this case to ${choice.name}` : 'Choose an institution to link'}
          </Button>
          <Button danger loading={decide.isPending} onClick={() => decide.mutate({ none: true })}>
            Not in the registry
          </Button>
        </div>
      </div>
    </section>
  );
};
