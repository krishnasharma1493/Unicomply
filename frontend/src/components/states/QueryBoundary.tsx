import React, { type ReactNode } from 'react';
import { LoadingState } from './LoadingState';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';

export interface QueryLike<TData = unknown, TError = unknown> {
  isLoading: boolean;
  isError: boolean;
  error?: TError | null;
  data?: TData;
  refetch?: () => void;
}

export interface QueryBoundaryProps<TData> {
  query: QueryLike<TData>;
  children: (data: TData) => ReactNode;
  loadingTip?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  isEmpty?: (data: TData) => boolean;
  card?: boolean;
}

export function QueryBoundary<TData>({
  query,
  children,
  loadingTip,
  emptyTitle,
  emptyDescription,
  emptyAction,
  isEmpty,
  card = false,
}: QueryBoundaryProps<TData>): React.ReactElement | null {
  if (query.isLoading) {
    return <LoadingState tip={loadingTip} card={card} />;
  }

  if (query.isError) {
    return <ErrorState error={query.error} onRetry={query.refetch} card={card} />;
  }

  if (query.data === undefined || query.data === null) {
    return (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
        action={emptyAction}
        card={card}
      />
    );
  }

  const isDataEmpty = isEmpty
    ? isEmpty(query.data)
    : Array.isArray(query.data) && query.data.length === 0;

  if (isDataEmpty) {
    return (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
        action={emptyAction}
        card={card}
      />
    );
  }

  return <>{children(query.data)}</>;
}

export default QueryBoundary;
