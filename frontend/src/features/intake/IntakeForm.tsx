import React from 'react';
import { Alert, Button, Col, DatePicker, Form, Input, Row, Select } from 'antd';
import dayjs from 'dayjs';
import { Controller, useFormState, type Control } from 'react-hook-form';
import {
  COMPLAINANT_TYPE_LABELS, COMPLAINANT_TYPES, SOURCE_CHANNEL_LABELS, SOURCE_CHANNELS,
} from '../../lib/api/enums';
import type { Meta } from '../../lib/api/types';
import type { IntakeFormValues } from './schema';

export interface IntakeFormProps {
  control: Control<IntakeFormValues>;
  meta: Meta;
  submitting: boolean;
  formError?: string | null;
  /** Shown just above the button: the possible-duplicate warning, which never blocks. */
  beforeSubmit?: React.ReactNode;
  /** The operator has reached the complaint text: a good moment to check for a duplicate. */
  onReachDetails?: () => void;
  onSubmit: () => void;
}

/**
 * One labelled antd field wired to react-hook-form; the error text is the Zod or the API message.
 * Each field subscribes to its own value and error, so a keystroke re-renders one field, not the form.
 */
function Field<K extends keyof IntakeFormValues>(props: {
  name: K;
  label: string;
  control: Control<IntakeFormValues>;
  required?: boolean;
  render: (value: IntakeFormValues[K], onChange: (v: IntakeFormValues[K]) => void, id: string) => React.ReactNode;
}) {
  const { name, label, control, required, render } = props;
  const { errors } = useFormState({ control, name });
  const message = errors[name]?.message as string | undefined;
  return (
    <Form.Item label={label} required={required} validateStatus={message ? 'error' : undefined} help={message} htmlFor={`intake-${name}`}>
      <Controller control={control} name={name} render={({ field }) => <>{render(field.value, field.onChange, `intake-${name}`)}</>} />
    </Form.Item>
  );
}

const text = (value: string, onChange: (v: string) => void, id: string, placeholder?: string) => (
  <Input id={id} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
);

/** A short labelled group of fields; the legend names what the fields are about. */
const Group: React.FC<{ legend: string; children: React.ReactNode; onFocus?: () => void }> = ({ legend, children, onFocus }) => (
  <fieldset className="uc-intake-group" onFocus={onFocus}>
    <legend>{legend}</legend>
    {children}
  </fieldset>
);

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/**
 * The intake form in three groups (institution, complaint, source), in the order the operator reads
 * the complaint. Every field keeps its label and Zod rule; ⌘/Ctrl + Enter registers from any field.
 */
export const IntakeForm = React.memo(function IntakeForm({
  control, meta, submitting, formError, beforeSubmit, onReachDetails, onSubmit,
}: IntakeFormProps) {
  const shared = { control };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !submitting) {
      e.preventDefault();
      onSubmit();
    }
  };
  return (
    <Form layout="vertical" onFinish={onSubmit} noValidate onKeyDown={onKeyDown} className="uc-intake-form">
      {formError && <Alert type="error" showIcon title={formError} style={{ marginBottom: 16 }} />}
      <Group legend="Institution">
        <Field {...shared} name="raw_institution_text" label="Institution name, as written in the complaint" required
          render={(v, onChange, id) => text(v, onChange, id, 'e.g. vindya valley engg college jabalpur')} />
        <Row gutter={12}>
          <Col xs={24} sm={12}>
            <Field {...shared} name="raw_state" label="State" render={(v, onChange, id) => text(v, onChange, id, 'e.g. Madhya Pradesh')} />
          </Col>
          <Col xs={24} sm={12}>
            <Field {...shared} name="raw_district" label="District" render={(v, onChange, id) => text(v, onChange, id)} />
          </Col>
          <Col xs={24} sm={12}>
            <Field {...shared} name="permanent_id" label="AICTE Permanent ID (if known)"
              render={(v, onChange, id) => text(v, onChange, id, '1-4812730561')} />
          </Col>
        </Row>
      </Group>

      <Group legend="Complaint" onFocus={onReachDetails}>
        <Row gutter={12}>
          <Col xs={24} sm={12}>
            <Field {...shared} name="category_id" label="Category" required
              render={(v, onChange, id) => (
                <Select id={id} value={v} placeholder="Choose" onChange={onChange}
                  options={meta.categories.map((c) => ({ value: c.id, label: c.name }))} />
              )} />
          </Col>
          <Col xs={24} sm={12}>
            <Field {...shared} name="route_to_bureau_id" label="Route to (default: the category's bureau)"
              render={(v, onChange, id) => (
                <Select id={id} allowClear value={v ?? undefined} placeholder="Category default"
                  onChange={(next) => onChange(next ?? null)}
                  options={meta.bureaus.map((b) => ({ value: b.id, label: `${b.code} — ${b.name}` }))} />
              )} />
          </Col>
        </Row>
        <Field {...shared} name="subject" label="Subject" required render={(v, onChange, id) => text(v, onChange, id)} />
        <Field {...shared} name="description" label="Description" required
          render={(v, onChange, id) => <Input.TextArea id={id} rows={5} value={v} onChange={(e) => onChange(e.target.value)} />} />
      </Group>

      <Group legend="Source">
        <Row gutter={12}>
          <Col xs={24} sm={12}>
            <Field {...shared} name="source_channel" label="Received through" required
              render={(v, onChange, id) => (
                <Select id={id} value={v} placeholder="Choose" onChange={onChange}
                  options={SOURCE_CHANNELS.map((c) => ({ value: c, label: SOURCE_CHANNEL_LABELS[c] }))} />
              )} />
          </Col>
          <Col xs={24} sm={12}>
            <Field {...shared} name="received_at" label="Date received" required
              render={(v, onChange, id) => (
                <DatePicker id={id} style={{ width: '100%' }} format="DD MMM YYYY" allowClear={false}
                  value={v ? dayjs(v) : null} onChange={(d) => onChange(d ? d.format('YYYY-MM-DD') : '')} />
              )} />
          </Col>
          <Col xs={24} sm={12}>
            <Field {...shared} name="complainant_type" label="Complainant" required
              render={(v, onChange, id) => (
                <Select id={id} value={v} placeholder="Choose" onChange={onChange}
                  options={COMPLAINANT_TYPES.map((c) => ({ value: c, label: COMPLAINANT_TYPE_LABELS[c] }))} />
              )} />
          </Col>
          <Col xs={24} sm={12}>
            <Field {...shared} name="complainant_name" label="Complainant name" render={(v, onChange, id) => text(v, onChange, id)} />
          </Col>
        </Row>
        <Field {...shared} name="external_ref" label="External reference (e.g. CPGRAMS number)" render={(v, onChange, id) => text(v, onChange, id)} />
      </Group>

      {beforeSubmit}
      <div className="uc-intake-submit">
        <Button type="primary" htmlType="submit" size="large" loading={submitting} aria-keyshortcuts="Meta+Enter Control+Enter">
          Register case
        </Button>
        <span className="uc-meta" aria-hidden="true">
          or <kbd>{isMac ? '⌘' : 'Ctrl'}</kbd> <kbd>Enter</kbd>
        </span>
      </div>
    </Form>
  );
});
