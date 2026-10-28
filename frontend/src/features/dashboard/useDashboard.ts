import { useQuery } from '@tanstack/react-query';
import { client } from '../../lib/api/client';
import type {
  AgeingBucket, DashboardSummary, Envelope, InstitutionStatusRow, OverlapGroupListItem, Page, WorkloadRow,
} from '../../lib/api/types';

const get = async <T,>(url: string, params?: Record<string, unknown>, signal?: AbortSignal) =>
  (await client.get<Envelope<T>>(url, { params, signal })).data.data;

export const useSummary = () =>
  useQuery<DashboardSummary>({ queryKey: ['dashboard', 'summary'], retry: false, queryFn: ({ signal }) => get('/dashboard/summary', undefined, signal) });

export const useWorkload = () =>
  useQuery<WorkloadRow[]>({ queryKey: ['dashboard', 'workload'], retry: false, queryFn: ({ signal }) => get('/dashboard/workload', undefined, signal) });

export const useAgeing = () =>
  useQuery<AgeingBucket[]>({ queryKey: ['dashboard', 'ageing'], retry: false, queryFn: ({ signal }) => get('/dashboard/ageing', undefined, signal) });

export const useTopInstitutions = (limit = 8) =>
  useQuery<InstitutionStatusRow[]>({
    queryKey: ['dashboard', 'institutions', limit],
    retry: false,
    queryFn: ({ signal }) => get('/dashboard/institutions', { limit }, signal),
  });

export const useLatestProbable = (limit = 5) =>
  useQuery<Page<OverlapGroupListItem>>({
    queryKey: ['overlaps', 'latest-probable', limit],
    retry: false,
    queryFn: async ({ signal }) =>
      (await client.get<Page<OverlapGroupListItem>>('/overlaps', { params: { tier: 'probable', status: 'open', limit }, signal })).data,
  });
