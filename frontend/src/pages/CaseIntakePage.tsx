import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { Col, Row } from 'antd';
import { AnimatePresence, motion } from 'motion/react';
import { useForm, useWatch } from 'react-hook-form';
import { PageHeader } from '../components/layout/PageHeader';
import { QueryBoundary } from '../components/states';
import { useMeta } from '../features/meta/useMeta';
import { splitApiFieldErrors } from '../features/intake/fieldErrors';
import { IntakeForm } from '../features/intake/IntakeForm';
import { IntakeResult } from '../features/intake/IntakeResult';
import { ResolutionPanel } from '../features/intake/ResolutionPanel';
import { intakeSchema, toCaseCreate, type IntakeFormValues } from '../features/intake/schema';
import { DuplicateNotice } from '../features/intake/DuplicateNotice';
import { checkDuplicate, resolvedPid } from '../features/intake/useDuplicateCheck';
import { useResolvePreview } from '../features/intake/useResolvePreview';
import { client } from '../lib/api/client';
import type { Candidate, CaseIntakeResult, Envelope, Meta } from '../lib/api/types';
import { apiErrorMessage } from '../lib/format';
import { useMotionPrefs } from '../lib/motion';
import '../styles/intake.css';

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
  const motionPrefs = useMotionPrefs();
  const [result, setResult] = useState<CaseIntakeResult | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [reachedDetails, setReachedDetails] = useState(false);
  const [warnedId, setWarnedId] = useState<number | null>(null);
  const restored = useRef(false);
  const { control, handleSubmit, reset, setValue, setError } = useForm<IntakeFormValues>({
    resolver: zodResolver(intakeSchema),
    defaultValues: blank(meta),
    mode: 'onTouched',
  });
  const [rawText, state, district, permanentId] = useWatch({
    control,
    name: ['raw_institution_text', 'raw_state', 'raw_district', 'permanent_id'],
  });
  const preview = useResolvePreview({ rawText, state, district });

  const { refetch } = preview;
  const retryPreview = useCallback(() => void refetch(), [refetch]);
  const selectCandidate = useCallback(
    (c: Candidate) => setValue('permanent_id', c.permanent_id, { shouldValidate: true }),
    [setValue],
  );
  const clearCandidate = useCallback(() => setValue('permanent_id', ''), [setValue]);

  const onReachDetails = useCallback(() => setReachedDetails(true), []);
  const duplicateNotice = useMemo(
    () => <DuplicateNotice control={control} resolution={preview.data} armed={reachedDetails} today={meta.today} onSeen={setWarnedId} />,
    [control, preview.data, reachedDetails, meta.today],
  );

  const create = useMutation({
    mutationFn: async (values: IntakeFormValues) =>
      (await client.post<Envelope<CaseIntakeResult>>('/cases', toCaseCreate(values))).data.data,
    onSuccess: (data) => {
      setResult(data);
      setFormError(null);
      void queryClient.invalidateQueries({ queryKey: ['cases'] });
    },
    onError: (error) => {
      const { fields, rest } = splitApiFieldErrors(error);
      Object.entries(fields).forEach(([name, message]) =>
        setError(name as keyof IntakeFormValues, { type: 'server', message }),
      );
      setFormError(Object.keys(fields).length && !rest.length ? 'Please correct the highlighted fields.' : [apiErrorMessage(error), ...rest].join(' '));
    },
  });

  const register = handleSubmit(async (values) => {
    setReachedDetails(true);
    const hit = await checkDuplicate(queryClient, {
      permanentId: resolvedPid(values.permanent_id, preview.data),
      receivedAt: values.received_at,
      categoryId: values.category_id,
      subject: values.subject,
    });
    if (hit && hit.case.id !== warnedId) {
      setWarnedId(hit.case.id); // the notice shows it now; the next press registers
      return;
    }
    create.mutate(values);
  }, () => {
    // Take the operator to the first field that needs fixing (fields mark themselves aria-invalid).
    window.setTimeout(() => (document.querySelector('.uc-intake-form [aria-invalid="true"]') as HTMLElement | null)?.focus(), 0);
  });
  // The form is memoised; it gets one stable submit handler that always runs the latest `register`.
  const latestRegister = useRef(register);
  latestRegister.current = register;
  const onSubmit = useCallback(() => void latestRegister.current(), []);

  // "Register another": the form comes back, and focus goes to its first field.
  useEffect(() => {
    if (result || !restored.current) return;
    restored.current = false;
    document.getElementById('intake-raw_institution_text')?.focus();
  }, [result]);

  const exit = motionPrefs.reduce ? { opacity: 0 } : { opacity: 0, y: -12, scale: 0.99 };

  return (
    <div className="uc-intake-stage">
      <AnimatePresence mode="popLayout" initial={false}>
        {result ? (
          <motion.div key={`result-${result.case.id}`} exit={{ opacity: 0 }} transition={motionPrefs.quick}>
            <IntakeResult
              result={result}
              meta={meta}
              onNewCase={() => {
                restored.current = true;
                setResult(null);
                setReachedDetails(false);
                setWarnedId(null);
                reset(blank(meta));
              }}
            />
          </motion.div>
        ) : (
          <motion.div
            key="form"
            initial={motionPrefs.enter(8)}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={exit}
            transition={motionPrefs.spring}
            style={{ transformOrigin: 'top center' }}
          >
            <Row gutter={[24, 24]} align="top">
              <Col xs={24} lg={14}>
                <section className="uc-section uc-intake-form-section" aria-label="New case">
                  <IntakeForm
                    control={control}
                    meta={meta}
                    submitting={create.isPending}
                    formError={formError}
                    beforeSubmit={duplicateNotice}
                    onReachDetails={onReachDetails}
                    onSubmit={onSubmit}
                  />
                </section>
              </Col>
              <Col xs={24} lg={10} className="uc-sticky-col">
                <ResolutionPanel
                  tooShort={preview.tooShort}
                  loading={preview.isFetching}
                  error={preview.error}
                  onRetry={retryPreview}
                  resolution={preview.data}
                  rawText={preview.text}
                  selectedId={permanentId || null}
                  onSelect={selectCandidate}
                  onClear={clearCandidate}
                />
              </Col>
            </Row>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
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
