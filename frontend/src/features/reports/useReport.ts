import { useMutation, useQuery } from '@tanstack/react-query';
import { client } from '../../lib/api/client';
import type { ReportKind } from '../../lib/api/enums';
import type { AnyReport, Envelope } from '../../lib/api/types';

export type Grouping = 'month' | 'quarter';

export interface ReportRequest {
  kind: ReportKind;
  from: string;
  to: string;
  grouping: Grouping;
}

export function reportParams(r: ReportRequest) {
  const params: Record<string, string> = { from: r.from, to: r.to };
  if (r.kind === 'periodic') params.group_by = r.grouping;
  return params;
}

export function useReport(r: ReportRequest | null) {
  return useQuery<AnyReport>({
    queryKey: ['report', r],
    enabled: r !== null,
    retry: false,
    queryFn: async ({ signal }) => (await client.get<Envelope<AnyReport>>(`/reports/${r!.kind}`, { params: reportParams(r!), signal })).data.data,
  });
}

/** Saves a Blob under a name, via a temporary link. */
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

const filenameOf = (disposition: string | undefined, fallback: string) =>
  /filename="?([^";]+)"?/i.exec(disposition ?? '')?.[1] ?? fallback;

/**
 * The CSV always comes from the backend (`?format=csv`), scoped to the viewer, never built from what is on screen (PRD §8).
 */
export function useCsvDownload() {
  return useMutation({
    mutationFn: async (r: ReportRequest) => {
      const res = await client.get<Blob>(`/reports/${r.kind}`, { params: { ...reportParams(r), format: 'csv' }, responseType: 'blob' });
      saveBlob(new Blob([res.data], { type: 'text/csv' }), filenameOf(res.headers?.['content-disposition'] as string | undefined, `unicomply-${r.kind}-${r.from}-${r.to}.csv`));
    },
  });
}
