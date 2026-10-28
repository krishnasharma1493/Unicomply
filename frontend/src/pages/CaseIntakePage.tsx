import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { Col, Row } from 'antd';
import { useForm, useWatch } from 'react-hook-form';
import { PageHeader } from '../components/layout/PageHeader';
import { QueryBoundary } from '../components/states';
import { useMeta } from '../features/meta/useMeta';
import { splitApiFieldErrors } from '../features/intake/fieldErrors';
import { IntakeForm } from '../features/intake/IntakeForm';
import { IntakeResult } from '../features/intake/IntakeResult';
import { ResolutionPanel } from '../features/intake/ResolutionPanel';
import { intakeSchema, toCaseCreate, type IntakeFormValues } from '../features/intake/schema';
import { useResolvePreview } from '../features/intake/useResolvePreview';
import { client } from '../lib/api/client';
import type { CaseIntakeResult, Envelope, Meta } from '../lib/api/types';
import { apiErrorMessage } from '../lib/format';


const blank = (meta: Meta): IntakeFormValues => ({
  source_channel: 'email',
  external_ref: '',
  received_at: meta.today,
  complainant_type: 'student',
  complainant_name: '',
  raw_institution_text: '',
  raw_state: '',
  raw_district: '',
  permanent_id: '',
  category_id: undefined as unknown as number, // the operator must choose one
  subject: '',
  description: '',
  route_to_bureau_id: null,
});

const IntakeWorkspace: React.FC<{ meta: Meta }> = ({ meta }) => {
  const queryClient = useQueryClient();
  const [result, setResult] = useState<CaseIntakeResult | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const { control, handleSubmit, reset, setValue, setError, formState } = useForm<IntakeFormValues>({
    resolver: zodResolver(intakeSchema),
    defaultValues: blank(meta),
    mode: 'onTouched',
  });
  const [rawText, state, district, permanentId] = useWatch({
    control,
    name: ['raw_institution_text', 'raw_state', 'raw_district', 'permanent_id'],
  });
  const preview = useResolvePreview({ rawText, state, district });

  const create = useMutation({
    mutationFn: async (values: IntakeFormValues) =>
      (await client.post<Envelope<CaseIntakeResult>>('/cases', toCaseCreate(values))).data.data,
    onSuccess: async (data) => {
      setResult(data);
      setFormError(null);
      await queryClient.invalidateQueries({ queryKey: ['cases'] });
    },
    onError: (error) => {
      const { fields, rest } = splitApiFieldErrors(error);
      Object.entries(fields).forEach(([name, message]) =>
        setError(name as keyof IntakeFormValues, { type: 'server', message }),
      );
      setFormError(Object.keys(fields).length && !rest.length ? 'Please correct the highlighted fields.' : [apiErrorMessage(error), ...rest].join(' '));
    },
  });

  if (result) {
    return (
      <IntakeResult
        result={result}
        meta={meta}
        onNewCase={() => {
          setResult(null);
          reset(blank(meta));
        }}
      />
    );
  }

  return (
    <Row gutter={[24, 24]}>
      <Col xs={24} lg={14}>
        <div className="uc-section uc-section-body" style={{ paddingTop: 20 }}>
        <IntakeForm
          control={control}
          errors={formState.errors}
          meta={meta}
          submitting={create.isPending}
          formError={formError}
          onSubmit={handleSubmit((values) => create.mutate(values))}
        />
        </div>
      </Col>
      <Col xs={24} lg={10} className="uc-sticky-col">
        <ResolutionPanel
          tooShort={preview.tooShort}
          loading={preview.isFetching}
          error={preview.error}
          onRetry={() => void preview.refetch()}
          resolution={preview.data}
          selectedId={permanentId || null}
          onSelect={(c) => setValue('permanent_id', c.permanent_id, { shouldValidate: true })}
          onClear={() => setValue('permanent_id', '')}
        />
      </Col>
    </Row>
  );
};

export const CaseIntakePage: React.FC = () => {
  const meta = useMeta();
  return (
    <div className="uc-page">
      <PageHeader
        title="Register a case"
        subtitle="Type the institution as the complainant wrote it. Matching institutions appear as you type; the case is checked for overlaps with other bureaus the moment it is registered."
      />
      <QueryBoundary query={meta} loadingTip="Loading form options">
        {(data) => <IntakeWorkspace meta={data} />}
      </QueryBoundary>
    </div>
  );
};

export default CaseIntakePage;
