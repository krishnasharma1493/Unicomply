import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Form, Input, Modal, Select, Space } from 'antd';
import { client } from '../../../lib/api/client';
import type { ApiError, Envelope, Meta, OverlapDecisionIn, OverlapGroupDetail } from '../../../lib/api/types';
import { apiErrorMessage } from '../../../lib/format';
import { overlapKey } from './useOverlapDetail';

export type Decision = OverlapDecisionIn['decision'];

const TITLE: Record<Decision, string> = { confirm: 'Confirm overlap', dismiss: 'Dismiss overlap', resolve: 'Resolve overlap' };
const INTRO: Record<Decision, string> = {
  confirm: 'Confirms that these cases must be coordinated. The coordinator, every involved bureau head, the Regional Office and senior management are alerted.',
  dismiss: 'These cases are not related enough to coordinate. Its pairs will not raise this alert again; a new case joining reopens the group.',
  resolve: 'The matter is coordinated and the group needs no further attention.',
};

export interface DecisionDialogProps {
  groupId: number;
  decision: Decision;
  /** Bureau ids that have a case in the group: the coordinator must come from one of them. */
  bureauIds: number[];
  meta: Meta;
  onClose: () => void;
}

const response = (e: unknown) => (e as { response?: { status?: number; data?: ApiError } }).response;

export const DecisionDialog: React.FC<DecisionDialogProps> = ({ groupId, decision, bureauIds, meta, onClose }) => {
  const queryClient = useQueryClient();
  const [remark, setRemark] = useState('');
  const [coordinator, setCoordinator] = useState<number | null>(null);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const officers = meta.officers.filter((o) => bureauIds.includes(o.bureau_id));
  const problem =
    decision === 'dismiss' && !remark.trim() ? 'A remark is required to dismiss an overlap' :
    decision === 'confirm' && coordinator === null ? 'Choose a coordinator' : null;

  const send = useMutation({
    mutationFn: async () => {
      const body: OverlapDecisionIn =
        decision === 'confirm' ? { decision, coordinator_id: coordinator as number, remark: remark.trim() || null }
        : decision === 'dismiss' ? { decision, remark: remark.trim() }
        : { decision, remark: remark.trim() || null };
      return (await client.post<Envelope<OverlapGroupDetail>>(`/overlaps/${groupId}/decision`, body)).data.data;
    },
    onSuccess: async (detail) => {
      queryClient.setQueryData(overlapKey(groupId), detail);
      await Promise.all(['overlaps', 'cases', 'alerts'].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
      onClose();
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
    if (!problem) send.mutate();
  };

  return (
    <Modal open title={TITLE[decision]} onCancel={onClose} footer={null} destroyOnHidden>
      <Form layout="vertical" onFinish={submit} noValidate>
        <p>{INTRO[decision]}</p>
        {error && <Alert type="error" showIcon title={error} style={{ marginBottom: 12 }} />}
        {decision === 'confirm' && (
          <Form.Item label="Coordinator" required validateStatus={touched && coordinator === null ? 'error' : undefined} help={touched && coordinator === null ? 'Choose a coordinator' : undefined}>
            <Select
              aria-label="Coordinator"
              placeholder="Choose a case officer"
              value={coordinator ?? undefined}
              onChange={setCoordinator}
              options={officers.map((o) => ({ value: o.id, label: `${o.name} (${meta.bureaus.find((b) => b.id === o.bureau_id)?.code})` }))}
              notFoundContent="No case officers in the involved bureaus"
            />
          </Form.Item>
        )}
        <Form.Item
          label="Remark"
          required={decision === 'dismiss'}
          validateStatus={touched && decision === 'dismiss' && problem ? 'error' : undefined}
          help={touched && decision === 'dismiss' && problem ? problem : undefined}
        >
          <Input.TextArea aria-label="Remark" rows={3} maxLength={2000} showCount value={remark} onChange={(e) => setRemark(e.target.value)} />
        </Form.Item>
        <Space style={{ justifyContent: 'flex-end', width: '100%' }}>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="primary" danger={decision === 'dismiss'} htmlType="submit" loading={send.isPending}>
            {decision === 'confirm' ? 'Confirm' : decision === 'dismiss' ? 'Dismiss' : 'Resolve'}
          </Button>
        </Space>
      </Form>
    </Modal>
  );
};
