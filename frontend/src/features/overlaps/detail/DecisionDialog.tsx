import React, { useId, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Form, Input, Modal, Popover, Select } from 'antd';
import type { InputRef } from 'antd';
import { client } from '../../../lib/api/client';
import type { ApiError, Envelope, LinkedCaseCard, Meta, OverlapDecisionIn, OverlapGroupDetail } from '../../../lib/api/types';
import { apiErrorMessage } from '../../../lib/format';
import { overlapKey } from './useOverlapDetail';

export type Decision = OverlapDecisionIn['decision'];

const TITLE: Record<Decision, string> = { confirm: 'Confirm overlap', dismiss: 'Dismiss overlap', resolve: 'Resolve overlap' };
const INTRO: Record<Decision, string> = {
  confirm: 'The coordinator, every involved bureau head, the Regional Office and senior management are alerted.',
  dismiss: 'These cases are not related enough to coordinate. Its pairs will not raise this alert again; a new case joining reopens the group.',
  resolve: 'The matter is coordinated and the group needs no further attention.',
};
const SUBMIT: Record<Decision, string> = { confirm: 'Confirm', dismiss: 'Dismiss', resolve: 'Resolve' };

const list = (items: string[]) =>
  items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

/** Who a confirmation reached, in the backend's terms: the involved heads, the Regional Office and senior management. */
export function alertedSentence(bureauCodes: string[]): string {
  const heads = bureauCodes.filter((c) => !c.startsWith('RO'));
  return heads.length > 0
    ? `The ${list(heads)} ${heads.length === 1 ? 'head' : 'heads'} and the Regional Office have been alerted.`
    : 'The Regional Office has been alerted.';
}

/** What a settled decision says, once, for the toast and the screen-reader announcement. */
export function settledMessage(detail: OverlapGroupDetail): string {
  const { group } = detail;
  if (group.status === 'confirmed') {
    return `Overlap confirmed. Coordinator: ${group.coordinator_name ?? 'not named'}. ${alertedSentence(group.bureau_codes)}`;
  }
  return group.status === 'dismissed' ? 'Overlap dismissed.' : 'Overlap resolved.';
}

export interface CoordinatorChoice {
  value: number;
  label: string;
  bureau: string;
  inGroup: number;
}

/**
 * Eligible coordinators: case officers of the bureaus that have a case in the group. Each carries
 * its bureau and how many of this group's cases it already holds; the officer on the oldest case
 * is the suggestion.
 */
export function coordinatorChoices(meta: Meta, bureauIds: number[], cases: LinkedCaseCard[]) {
  const choices: CoordinatorChoice[] = meta.officers
    .filter((o) => bureauIds.includes(o.bureau_id))
    .map((o) => {
      const bureau = meta.bureaus.find((b) => b.id === o.bureau_id);
      return {
        value: o.id,
        label: `${o.name} (${bureau?.code ?? '?'})`,
        bureau: bureau?.name ?? '',
        inGroup: cases.filter((c) => c.assigned_officer_name === o.name).length,
      };
    });
  const oldest = [...cases].sort((a, b) => a.received_at.localeCompare(b.received_at) || a.case_id - b.case_id)[0];
  const suggested = oldest?.assigned_officer_name
    ? (meta.officers.find((o) => o.name === oldest.assigned_officer_name && bureauIds.includes(o.bureau_id))?.id ?? null)
    : null;
  return { choices, suggested, oldestRef: oldest?.case_ref ?? '' };
}

const response = (e: unknown) => (e as { response?: { status?: number; data?: ApiError } }).response;

interface FormProps {
  groupId: number;
  decision: Decision;
  bureauIds: number[];
  meta: Meta;
  cases: LinkedCaseCard[];
  onCancel: () => void;
  onDecided: (detail: OverlapGroupDetail) => void;
  /** Set when the form is in the popover: the first field takes focus as it opens. */
  autoFocus?: boolean;
  remarkRef?: React.Ref<InputRef>;
  /** Reports whether a dropdown inside is open, so Escape closes that first. */
  onDropdown?: (open: boolean) => void;
}

const DecisionForm: React.FC<FormProps> = ({ groupId, decision, bureauIds, meta, cases, onCancel, onDecided, autoFocus, remarkRef, onDropdown }) => {
  const queryClient = useQueryClient();
  const ids = useId();
  const { choices, suggested, oldestRef } = coordinatorChoices(meta, bureauIds, cases);
  const [remark, setRemark] = useState('');
  const [coordinator, setCoordinator] = useState<number | null>(suggested);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const coordinatorProblem = decision === 'confirm' && coordinator === null ? 'Choose a coordinator' : null;
  const remarkProblem = decision === 'dismiss' && !remark.trim() ? 'A remark is required to dismiss an overlap' : null;
  const showCoordinator = touched && coordinatorProblem !== null;
  const showRemark = touched && remarkProblem !== null;

  const send = useMutation({
    mutationFn: async () => {
      const body: OverlapDecisionIn =
        decision === 'confirm' ? { decision, coordinator_id: coordinator as number, remark: remark.trim() || null }
        : decision === 'dismiss' ? { decision, remark: remark.trim() }
        : { decision, remark: remark.trim() || null };
      return (await client.post<Envelope<OverlapGroupDetail>>(`/overlaps/${groupId}/decision`, body)).data.data;
    },
    onSuccess: (detail) => {
      // The settled state shows at once; the lists and alerts catch up behind it.
      queryClient.setQueryData(overlapKey(groupId), detail);
      onDecided(detail);
      void Promise.all(['overlaps', 'cases', 'alerts'].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
    },
    onError: async (e) => {
      setError(apiErrorMessage(e));
      if (response(e)?.data?.error.code === 'ALREADY_DECIDED') {
        await queryClient.invalidateQueries({ queryKey: overlapKey(groupId) }); // show what was decided, and by when
      }
    },
  });

  const submit = () => {
    setTouched(true);
    if (!coordinatorProblem && !remarkProblem) send.mutate();
  };

  const coordinatorHelp = `${ids}-coordinator-help`;
  const remarkHelp = `${ids}-remark-help`;

  return (
    <Form layout="vertical" onFinish={submit} noValidate className="ov-decision-form" requiredMark={false}>
      <p className="ov-decision-intro">{INTRO[decision]}</p>
      {error && <Alert type="error" showIcon title={error} className="ov-decision-error" />}
      {decision === 'confirm' && (
        <Form.Item
          label="Coordinator"
          validateStatus={showCoordinator ? 'error' : undefined}
          help={showCoordinator ? <span id={coordinatorHelp}>{coordinatorProblem}</span> : undefined}
          extra={
            choices.length === 0
              ? 'No case officers in the involved bureaus, so no coordinator can be named here.'
              : suggested !== null && coordinator === suggested
                ? `Suggested: the officer on the oldest case, ${oldestRef}.`
                : undefined
          }
        >
          <Select
            aria-label="Coordinator"
            aria-invalid={showCoordinator || undefined}
            aria-describedby={showCoordinator ? coordinatorHelp : undefined}
            autoFocus={autoFocus}
            allowClear
            showSearch={{ optionFilterProp: 'label' }}
            placeholder="Choose a case officer"
            value={coordinator ?? undefined}
            onChange={(v) => setCoordinator(v ?? null)}
            onOpenChange={onDropdown}
            classNames={{ popup: { root: 'ov-officer-popup' } }}
            options={choices}
            optionRender={(o) => {
              const c = o.data as CoordinatorChoice;
              return (
                <span className="ov-officer">
                  <span>{c.label}</span>
                  <span className="ov-officer-meta">
                    {c.bureau}
                    {' · '}
                    {c.inGroup === 0 ? 'no case in this group' : `${c.inGroup} ${c.inGroup === 1 ? 'case' : 'cases'} in this group`}
                  </span>
                </span>
              );
            }}
            notFoundContent="No case officers in the involved bureaus"
          />
        </Form.Item>
      )}
      <Form.Item
        label={decision === 'dismiss' ? 'Remark' : 'Remark (optional)'}
        validateStatus={showRemark ? 'error' : undefined}
        help={showRemark ? <span id={remarkHelp}>{remarkProblem}</span> : undefined}
      >
        <Input.TextArea
          ref={remarkRef}
          aria-label="Remark"
          aria-required={decision === 'dismiss' || undefined}
          aria-invalid={showRemark || undefined}
          aria-describedby={showRemark ? remarkHelp : undefined}
          rows={decision === 'confirm' ? 2 : 3}
          maxLength={2000}
          showCount={decision !== 'confirm'}
          value={remark}
          onChange={(e) => setRemark(e.target.value)}
        />
      </Form.Item>
      <div className="ov-decision-actions">
        <Button onClick={onCancel}>Cancel</Button>
        <Button type="primary" danger={decision === 'dismiss'} htmlType="submit" loading={send.isPending}>
          {SUBMIT[decision]}
        </Button>
      </div>
    </Form>
  );
};

type Shared = Omit<FormProps, 'decision' | 'onCancel' | 'autoFocus' | 'remarkRef' | 'onDropdown'>;

/**
 * Confirm, inline: a non-modal popover that grows from the button and holds only what the decision
 * needs. Escape closes it and puts focus back on the button.
 */
export const ConfirmPopover: React.FC<Shared & { open: boolean; onOpenChange: (open: boolean) => void }> = ({ open, onOpenChange, ...form }) => {
  const trigger = useRef<HTMLButtonElement>(null);
  const dropdown = useRef(false);
  const titleId = useId();
  const close = () => {
    onOpenChange(false);
    trigger.current?.focus();
  };
  return (
    <Popover
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : onOpenChange(false))}
      trigger="click"
      placement="bottomRight"
      destroyOnHidden
      content={
        <div
          role="dialog"
          aria-labelledby={titleId}
          className="ov-popover"
          onKeyDown={(e) => {
            if (e.key === 'Escape' && !dropdown.current) {
              e.stopPropagation();
              close();
            }
          }}
        >
          <h2 id={titleId} className="ov-popover-title">{TITLE.confirm}</h2>
          <DecisionForm
            {...form}
            decision="confirm"
            autoFocus
            onCancel={close}
            onDropdown={(o) => {
              dropdown.current = o;
            }}
          />
        </div>
      }
    >
      <Button ref={trigger} type="primary" aria-expanded={open} aria-haspopup="dialog">
        Confirm overlap
      </Button>
    </Popover>
  );
};

/**
 * Dismiss and Resolve stay modal: they end the group's life. The modal stays mounted between uses,
 * so closing it hands focus back to the button that opened it.
 */
export const DecisionModal: React.FC<Shared & { decision: Decision | null; onClose: () => void; afterClose?: () => void }> = ({
  decision,
  onClose,
  afterClose,
  ...form
}) => {
  const remark = useRef<InputRef>(null);
  const [shown, setShown] = useState<Decision>('dismiss');
  if (decision && decision !== shown) setShown(decision);
  return (
    <Modal
      open={decision !== null}
      title={TITLE[decision ?? shown]}
      onCancel={onClose}
      footer={null}
      destroyOnHidden
      afterOpenChange={(o) => {
        if (o) remark.current?.focus();
      }}
      afterClose={afterClose}
    >
      <DecisionForm {...form} decision={decision ?? shown} onCancel={onClose} remarkRef={remark} />
    </Modal>
  );
};
