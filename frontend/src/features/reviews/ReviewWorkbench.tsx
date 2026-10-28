import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, Input, List, Space, Spin, Typography } from 'antd';
import { CandidateList } from '../../components/signature';
import { ErrorState } from '../../components/states';
import { client } from '../../lib/api/client';
import type { ApiError, Envelope, ReviewDecideIn, ReviewDecideResult, ReviewItem } from '../../lib/api/types';
import { apiErrorMessage, formatDate } from '../../lib/format';
import { reviewsKey, SEARCH_MIN_CHARS, useRegistrySearch } from './useReviews';

const { Text, Title } = Typography;

interface Choice {
  permanent_id: string;
  name: string;
}

/** One review: the complaint's own words, the engine's candidates, a registry search, or "not in registry". */
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

  return (
    <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
      <Card size="small">
        <Space orientation="vertical" size={2}>
          <Text type="secondary">{review.case_ref} · received {formatDate(review.received_at)}</Text>
          <Title level={3} style={{ margin: '2px 0' }}>{review.raw_institution_text}</Title>
          <Text type="secondary">{where || 'No state or district given'}</Text>
          <Text>{review.subject}</Text>
        </Space>
      </Card>

      {error && <Alert type="error" showIcon title={error} />}

      <Card size="small" title="Suggested institutions">
        {review.candidates.length === 0 ? (
          <Text type="secondary">The engine found no candidates. Search the registry below.</Text>
        ) : (
          <CandidateList
            candidates={review.candidates}
            selectedId={choice?.permanent_id ?? null}
            onSelect={(c) => setChoice({ permanent_id: c.permanent_id, name: c.name })}
          />
        )}
      </Card>

      <Card size="small" title="Search the registry">
        <Input.Search
          aria-label="Search the registry"
          placeholder="Institution name or Permanent ID"
          allowClear
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
        <div style={{ marginTop: 12 }}>
          {term.trim().length < SEARCH_MIN_CHARS ? null : search.isFetching ? (
            <div role="status" aria-label="Searching" style={{ textAlign: 'center' }}><Spin /></div>
          ) : search.isError ? (
            <ErrorState message={apiErrorMessage(search.error)} onRetry={() => void search.refetch()} style={{ padding: 0 }} />
          ) : (
            <List
              locale={{ emptyText: 'No institution matches that search.' }}
              dataSource={search.data?.data ?? []}
              renderItem={(inst) => (
                <List.Item
                  actions={[
                    <Button
                      key="pick"
                      size="small"
                      aria-label={`Pick ${inst.name}`}
                      type={choice?.permanent_id === inst.permanent_id ? 'primary' : 'default'}
                      onClick={() => setChoice({ permanent_id: inst.permanent_id, name: inst.name })}
                    >
                      {choice?.permanent_id === inst.permanent_id ? 'Picked' : 'Pick'}
                    </Button>,
                  ]}
                >
                  <List.Item.Meta title={inst.name} description={`${inst.permanent_id} · ${inst.district}, ${inst.state}`} />
                </List.Item>
              )}
            />
          )}
        </div>
      </Card>

      <Space wrap>
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
        <Link to={`/cases/${review.case_id}`}>Open the case</Link>
      </Space>
    </Space>
  );
};
