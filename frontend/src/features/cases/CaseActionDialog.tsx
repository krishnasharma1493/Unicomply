import React, { useEffect, useId, useRef, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, DatePicker, Form, Input, Modal, Select, Space, Typography } from 'antd';
import dayjs from 'dayjs';
import { Controller, useForm, type FieldErrors } from 'react-hook-form';
import { ACTION_TYPE_LABELS, DISPOSE_OUTCOME_LABELS, DISPOSE_OUTCOMES, type ActionType } from '../../lib/api/enums';
import { client } from '../../lib/api/client';
import type { ApiError, CaseActionIn, CaseActionResult, CaseRead, Envelope, Meta, OpenOverlapErrorDetails } from '../../lib/api/types';
import { apiErrorMessage } from '../../lib/format';
import { actionSchema, emptyActionForm, toActionBody, type ActionFormValues } from './actionSchema';
import { caseKey } from './useCaseDetail';
import { REMARKS_REQUIRED } from './workflow';

const { Text } = Typography;

export interface CaseActionDialogProps {
  /** The dialog stays mounted and only toggles, so focus goes back to the button that opened it. */
  open: boolean;
  type: ActionType;
  caseRead: CaseRead;
  meta: Meta;
  onClose: () => void;
  /** What was typed for this action on this case, kept across close and reopen until it succeeds. */
  draft?: ActionFormValues;
  onDraftChange?: (values: ActionFormValues) => void;
  /** Linked refs of the open overlap groups this case is in, known before submit (for Dispose). */
  openOverlapRefs?: string[];
  /** Called after the action is recorded, with a short past-tense sentence for the live region and toast. */
  onDone?: (type: ActionType, said: string, result: CaseActionResult) => void;
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

/** What each action did, said once it is done ("Remark added"). */
export const ACTION_DONE: Record<ActionType, string> = {
  assign: 'Officer assigned',
  interim_reply: 'Interim reply recorded',
  remark: 'Remark added',
  transfer: 'Case transferred',
  escalate: 'Case escalated',
  dispose: 'Case disposed',
  reopen: 'Case reopened',
};

/** The fields in the order they appear, so focus can go to the first one that is wrong. */
const FIELD_ORDER: (keyof ActionFormValues)[] = ['to_officer_id', 'to_bureau_id', 'expected_disposal_date', 'outcome', 'remarks'];
const FIRST_FIELD: Record<ActionType, keyof ActionFormValues> = {
  assign: 'to_officer_id',
  transfer: 'to_bureau_id',
  interim_reply: 'expected_disposal_date',
  dispose: 'outcome',
  remark: 'remarks',
  escalate: 'remarks',
  reopen: 'remarks',
};

type Focusable = { focus: () => void } | null;

const ActionForm: React.FC<Omit<CaseActionDialogProps, 'open'> & { focusRequest: number }> = ({
  type, caseRead, meta, onClose, draft, onDraftChange, openOverlapRefs, onDone, leavesScope = false, onLeftScope, focusRequest,
}) => {
  const queryClient = useQueryClient();
  const uid = useId();
  const knownOverlap = type === 'dispose' && openOverlapRefs && openOverlapRefs.length > 0 ? openOverlapRefs : null;
  const [overlap, setOverlap] = useState<OpenOverlapErrorDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refs = useRef<Partial<Record<keyof ActionFormValues, Focusable>>>({});
  const { control, handleSubmit, formState, setError: setFieldError, watch } = useForm<ActionFormValues>({
    resolver: zodResolver(actionSchema(type, meta.today, caseRead.current_bureau_id)),
    defaultValues: draft ?? emptyActionForm,
  });
  const errors = formState.errors;

  useEffect(() => {
    if (!onDraftChange) return undefined;
    const sub = watch((v) => onDraftChange({ ...emptyActionForm, ...(v as ActionFormValues) }));
    return () => sub.unsubscribe();
  }, [watch, onDraftChange]);

  // The first field takes focus on opening, and again once the dialog has finished appearing.
  useEffect(() => {
    refs.current[FIRST_FIELD[type]]?.focus();
  }, [focusRequest, type]);

  const run = useMutation({
    mutationFn: async (body: CaseActionIn) =>
      (await client.post<Envelope<CaseActionResult>>(`/cases/${caseRead.id}/actions`, body)).data.data,
    onSuccess: async (result) => {
      if (leavesScope) queryClient.removeQueries({ queryKey: caseKey(caseRead.id) });
      await Promise.all([
        leavesScope ? Promise.resolve() : queryClient.invalidateQueries({ queryKey: caseKey(caseRead.id) }),
        queryClient.invalidateQueries({ queryKey: ['cases'] }),
        queryClient.invalidateQueries({ queryKey: ['overlaps'] }),
      ]);
      onDone?.(type, ACTION_DONE[type], result);
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
      const fields = Object.entries(res?.data?.error.fields ?? {});
      fields.forEach(([name, messages]) =>
        setFieldError(name as keyof ActionFormValues, { type: 'server', message: messages.join(' ') }),
      );
      const firstBad = FIELD_ORDER.find((f) => fields.some(([n]) => n === f));
      if (firstBad) refs.current[firstBad]?.focus();
      setError(apiErrorMessage(e));
    },
  });

  const onInvalid = (bad: FieldErrors<ActionFormValues>) => {
    const firstBad = FIELD_ORDER.find((f) => bad[f]);
    if (firstBad) refs.current[firstBad]?.focus();
  };
  const linkedRefs = overlap?.linked_case_refs ?? knownOverlap;
  const confirmed = linkedRefs !== null;
  // A dispose on a case in an open overlap is confirmed with the warning already on screen.
  const submit = handleSubmit((values) => run.mutate(toActionBody(type, values, confirmed)), onInvalid);

  const errId = (name: keyof ActionFormValues) => `${uid}-${name}-error`;
  const a11y = (name: keyof ActionFormValues) =>
    errors[name] ? { 'aria-invalid': true as const, 'aria-describedby': errId(name) } : { 'aria-invalid': false as const };
  const field = (name: keyof ActionFormValues, label: string, control_: React.ReactNode, required = false) => (
    <Form.Item
      label={label}
      required={required}
      validateStatus={errors[name] ? 'error' : undefined}
      help={errors[name] ? <span id={errId(name)}>{errors[name]?.message as string}</span> : undefined}
    >
      {control_}
    </Form.Item>
  );
  const setRef = (name: keyof ActionFormValues) => (el: Focusable) => {
    refs.current[name] = el;
  };

  const officers = meta.officers.filter((o) => o.bureau_id === caseRead.current_bureau_id);
  const remarksRequired = REMARKS_REQUIRED.includes(type) || type === 'remark';

  return (
    <Form layout="vertical" onFinish={() => void submit()} noValidate>
      {INTRO[type] && <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>{INTRO[type]}</Text>}
      {error && <Alert type="error" showIcon title={error} style={{ marginBottom: 12 }} />}
      {linkedRefs && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          title="This case is part of an open overlap group"
          description={
            <div>
              <div>Other bureaus are still working on linked cases. Closing this one may lead to conflicting action.</div>
              <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>
                {linkedRefs.map((ref) => <li key={ref}>{ref}</li>)}
              </ul>
            </div>
          }
        />
      )}
      {type === 'assign' && field('to_officer_id', 'Officer', (
        <Controller control={control} name="to_officer_id" render={({ field: f }) => (
          <Select ref={setRef('to_officer_id')} aria-label="Officer" {...a11y('to_officer_id')} value={f.value ?? undefined} onChange={f.onChange} placeholder="Choose an officer"
            options={officers.map((o) => ({ value: o.id, label: o.name }))} notFoundContent="No officers in this bureau" />
        )} />
      ), true)}
      {type === 'transfer' && field('to_bureau_id', 'Transfer to', (
        <Controller control={control} name="to_bureau_id" render={({ field: f }) => (
          <Select ref={setRef('to_bureau_id')} aria-label="Transfer to" {...a11y('to_bureau_id')} value={f.value ?? undefined} onChange={f.onChange} placeholder="Choose a bureau"
            options={meta.bureaus.filter((b) => b.id !== caseRead.current_bureau_id).map((b) => ({ value: b.id, label: `${b.code} — ${b.name}` }))} />
        )} />
      ), true)}
      {type === 'interim_reply' && field('expected_disposal_date', 'Expected disposal date', (
        <Controller control={control} name="expected_disposal_date" render={({ field: f }) => (
          <DatePicker ref={setRef('expected_disposal_date')} aria-label="Expected disposal date" {...a11y('expected_disposal_date')} style={{ width: '100%' }} format="DD MMM YYYY"
            value={f.value ? dayjs(f.value) : null} onChange={(d) => f.onChange(d ? d.format('YYYY-MM-DD') : '')} />
        )} />
      ), true)}
      {type === 'dispose' && field('outcome', 'Outcome', (
        <Controller control={control} name="outcome" render={({ field: f }) => (
          <Select ref={setRef('outcome')} aria-label="Outcome" {...a11y('outcome')} value={f.value ?? undefined} onChange={f.onChange} placeholder="Choose the outcome"
            options={DISPOSE_OUTCOMES.map((o) => ({ value: o, label: DISPOSE_OUTCOME_LABELS[o] }))} />
        )} />
      ), true)}
      {field('remarks', 'Remarks', (
        <Controller control={control} name="remarks" render={({ field: f }) => (
          <Input.TextArea ref={setRef('remarks')} aria-label="Remarks" {...a11y('remarks')} rows={4} value={f.value} onChange={f.onChange} maxLength={2000} showCount />
        )} />
      ), remarksRequired)}
      <Space style={{ justifyContent: 'flex-end', width: '100%' }}>
        <Button onClick={onClose}>Cancel</Button>
        {confirmed ? (
          <Button type="primary" danger htmlType="submit" loading={run.isPending}>Dispose anyway</Button>
        ) : (
          <Button type="primary" htmlType="submit" loading={run.isPending}>{ACTION_TYPE_LABELS[type]}</Button>
        )}
      </Space>
    </Form>
  );
};

/**
 * One dialog for every workflow action (PRD §4.3). A dispose on a case in an open overlap warns before
 * anything is sent. The component stays mounted while the case is open: it remembers the button that
 * opened it and gives focus back to that button when it closes, however it closes.
 */
export const CaseActionDialog: React.FC<CaseActionDialogProps> = ({ open, ...props }) => {
  const [focusRequest, setFocusRequest] = useState(0);
  const trigger = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  if (open && !wasOpen.current && typeof document !== 'undefined') {
    trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }
  wasOpen.current = open;
  useEffect(() => {
    if (open) return;
    const t = trigger.current;
    trigger.current = null;
    if (t && t.isConnected) t.focus();
  }, [open]);
  if (!open) return null;
  return (
    <Modal
      open
      title={`${ACTION_TYPE_LABELS[props.type]} — ${props.caseRead.case_ref}`}
      onCancel={props.onClose}
      footer={null}
      afterOpenChange={(isOpen) => {
        if (isOpen) setFocusRequest((n) => n + 1);
      }}
    >
      {/* A fresh form per opening (old errors cleared); what was typed comes back from the draft. */}
      <ActionForm key={props.type} {...props} focusRequest={focusRequest} />
    </Modal>
  );
};
