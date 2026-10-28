import React, { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, DatePicker, Form, Input, Modal, Select, Space, Typography } from 'antd';
import dayjs from 'dayjs';
import { Controller, useForm } from 'react-hook-form';
import { ACTION_TYPE_LABELS, DISPOSE_OUTCOME_LABELS, DISPOSE_OUTCOMES, type ActionType } from '../../lib/api/enums';
import { client } from '../../lib/api/client';
import type { ApiError, CaseActionIn, CaseActionResult, CaseRead, Envelope, Meta, OpenOverlapErrorDetails } from '../../lib/api/types';
import { apiErrorMessage } from '../../lib/format';
import { actionSchema, emptyActionForm, toActionBody, type ActionFormValues } from './actionSchema';
import { caseKey } from './useCaseDetail';
import { REMARKS_REQUIRED } from './workflow';

const { Text } = Typography;

export interface CaseActionDialogProps {
  type: ActionType;
  caseRead: CaseRead;
  meta: Meta;
  onClose: () => void;
  /** The action took the case out of the viewer's scope (a head transferring it away), so it must not be reloaded. */
  leavesScope?: boolean;
  onLeftScope?: () => void;
}

const apiError = (e: unknown) => (e as { response?: { status?: number; data?: ApiError } }).response;

const INTRO: Partial<Record<ActionType, string>> = {
  transfer: 'The SLA clock keeps running and the assigned officer is cleared.',
  escalate: 'Raises the escalation level and alerts senior management.',
  reopen: 'Starts a fresh SLA clock.',
  dispose: 'Closes the case. Choose how it was resolved.',
};

/** One dialog for every workflow action (PRD §4.3). A dispose that hits an open overlap asks for confirmation first. */
export const CaseActionDialog: React.FC<CaseActionDialogProps> = ({ type, caseRead, meta, onClose, leavesScope = false, onLeftScope }) => {
  const queryClient = useQueryClient();
  const [overlap, setOverlap] = useState<OpenOverlapErrorDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { control, handleSubmit, formState, setError: setFieldError, getValues } = useForm<ActionFormValues>({
    resolver: zodResolver(actionSchema(type, meta.today, caseRead.current_bureau_id)),
    defaultValues: emptyActionForm,
  });
  const errors = formState.errors;

  const run = useMutation({
    mutationFn: async (body: CaseActionIn) =>
      (await client.post<Envelope<CaseActionResult>>(`/cases/${caseRead.id}/actions`, body)).data.data,
    onSuccess: async () => {
      if (leavesScope) queryClient.removeQueries({ queryKey: caseKey(caseRead.id) });
      await Promise.all([
        leavesScope ? Promise.resolve() : queryClient.invalidateQueries({ queryKey: caseKey(caseRead.id) }),
        queryClient.invalidateQueries({ queryKey: ['cases'] }),
        queryClient.invalidateQueries({ queryKey: ['overlaps'] }),
      ]);
      onClose();
      if (leavesScope) onLeftScope?.();
    },
    onError: (e) => {
      const res = apiError(e);
      if (res?.status === 409 && res.data?.error.code === 'OPEN_OVERLAP') {
        setOverlap(res.data.error.details as OpenOverlapErrorDetails);
        setError(null);
        return;
      }
      Object.entries(res?.data?.error.fields ?? {}).forEach(([name, messages]) =>
        setFieldError(name as keyof ActionFormValues, { type: 'server', message: messages.join(' ') }),
      );
      setError(apiErrorMessage(e));
    },
  });

  const submit = handleSubmit((values) => run.mutate(toActionBody(type, values)));
  const confirmAnyway = () => run.mutate(toActionBody(type, getValues(), true));
  const field = (name: keyof ActionFormValues, label: string, control_: React.ReactNode, required = false) => (
    <Form.Item label={label} required={required} validateStatus={errors[name] ? 'error' : undefined} help={errors[name]?.message as string | undefined}>
      {control_}
    </Form.Item>
  );

  const officers = meta.officers.filter((o) => o.bureau_id === caseRead.current_bureau_id);
  const remarksRequired = REMARKS_REQUIRED.includes(type) || type === 'remark';

  return (
    <Modal
      open
      title={`${ACTION_TYPE_LABELS[type]} — ${caseRead.case_ref}`}
      onCancel={onClose}
      footer={null}
      destroyOnHidden
    >
      <Form layout="vertical" onFinish={submit} noValidate>
        {INTRO[type] && <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>{INTRO[type]}</Text>}
        {error && <Alert type="error" showIcon title={error} style={{ marginBottom: 12 }} />}
        {overlap && (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 12 }}
            title="This case is part of an open overlap group"
            description={
              <div>
                <div>Other bureaus are still working on linked cases. Closing this one may lead to conflicting action.</div>
                <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>
                  {overlap.linked_case_refs.map((ref) => <li key={ref}>{ref}</li>)}
                </ul>
              </div>
            }
          />
        )}
        {type === 'assign' && field('to_officer_id', 'Officer', (
          <Controller control={control} name="to_officer_id" render={({ field: f }) => (
            <Select aria-label="Officer" value={f.value ?? undefined} onChange={f.onChange} placeholder="Choose an officer"
              options={officers.map((o) => ({ value: o.id, label: o.name }))} notFoundContent="No officers in this bureau" />
          )} />
        ), true)}
        {type === 'transfer' && field('to_bureau_id', 'Transfer to', (
          <Controller control={control} name="to_bureau_id" render={({ field: f }) => (
            <Select aria-label="Transfer to" value={f.value ?? undefined} onChange={f.onChange} placeholder="Choose a bureau"
              options={meta.bureaus.filter((b) => b.id !== caseRead.current_bureau_id).map((b) => ({ value: b.id, label: `${b.code} — ${b.name}` }))} />
          )} />
        ), true)}
        {type === 'interim_reply' && field('expected_disposal_date', 'Expected disposal date', (
          <Controller control={control} name="expected_disposal_date" render={({ field: f }) => (
            <DatePicker aria-label="Expected disposal date" style={{ width: '100%' }} format="DD MMM YYYY"
              value={f.value ? dayjs(f.value) : null} onChange={(d) => f.onChange(d ? d.format('YYYY-MM-DD') : '')} />
          )} />
        ), true)}
        {type === 'dispose' && field('outcome', 'Outcome', (
          <Controller control={control} name="outcome" render={({ field: f }) => (
            <Select aria-label="Outcome" value={f.value ?? undefined} onChange={f.onChange} placeholder="Choose the outcome"
              options={DISPOSE_OUTCOMES.map((o) => ({ value: o, label: DISPOSE_OUTCOME_LABELS[o] }))} />
          )} />
        ), true)}
        {field('remarks', 'Remarks', (
          <Controller control={control} name="remarks" render={({ field: f }) => (
            <Input.TextArea aria-label="Remarks" rows={4} value={f.value} onChange={f.onChange} maxLength={2000} showCount />
          )} />
        ), remarksRequired)}
        <Space style={{ justifyContent: 'flex-end', width: '100%' }}>
          <Button onClick={onClose}>Cancel</Button>
          {overlap ? (
            <Button type="primary" danger loading={run.isPending} onClick={confirmAnyway}>Dispose anyway</Button>
          ) : (
            <Button type="primary" htmlType="submit" loading={run.isPending}>{ACTION_TYPE_LABELS[type]}</Button>
          )}
        </Space>
      </Form>
    </Modal>
  );
};
