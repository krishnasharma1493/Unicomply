import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Form, Input, Button, Alert } from 'antd';
import { LockOutlined, MailOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { useAuth } from '../auth/AuthProvider';
import { env } from '../lib/env';
import { PersonaCards } from '../features/auth/PersonaCards';
import { getDemoPassword, type Persona } from '../features/auth/personas';

interface LoginFormValues {
  email: string;
  password: string;
}

export const LoginPage: React.FC = () => {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [loadingPersonaId, setLoadingPersonaId] = useState<string | null>(null);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // If already logged in, redirect to destination or dashboard
  React.useEffect(() => {
    if (user) {
      const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/';
      navigate(from, { replace: true });
    }
  }, [user, navigate, location]);

  const handlePersonaLogin = async (persona: Persona) => {
    setLoadingPersonaId(persona.id);
    setErrorMessage(null);
    try {
      await login(persona.email, getDemoPassword());
      const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/';
      navigate(from, { replace: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Authentication failed';
      setErrorMessage(`Failed to sign in as ${persona.name}: ${msg}`);
    } finally {
      setLoadingPersonaId(null);
    }
  };

  const handleFormSubmit = async (values: LoginFormValues) => {
    setFormSubmitting(true);
    setErrorMessage(null);
    try {
      await login(values.email, values.password);
      const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/';
      navigate(from, { replace: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid credentials or network error';
      setErrorMessage(msg);
    } finally {
      setFormSubmitting(false);
    }
  };

  return (
    <main className="uc-login">
      <div className="uc-login-col" style={{ maxWidth: env.VITE_DEMO_MODE ? '40rem' : '26rem' }}>
        <header className="uc-login-head">
          <div className="uc-brand-name">AICTE</div>
          <h1>Unicomply Portal</h1>
          <p className="uc-page-subtitle" style={{ marginInline: 'auto' }}>
            AICTE complaint monitoring: grievance redressal, cross-bureau overlap detection and compliance tracking.
          </p>
        </header>

        {errorMessage && (
          <Alert
            title="Sign-in error"
            description={errorMessage}
            type="error"
            showIcon
            closable
            onClose={() => setErrorMessage(null)}
            style={{ marginBottom: 20 }}
          />
        )}

        {env.VITE_DEMO_MODE && (
          <section aria-labelledby="persona-heading" style={{ marginBottom: 32 }}>
            <div className="uc-login-section-head">
              <h2 id="persona-heading">Demo persona one-click access</h2>
              <span className="uc-meta">
                <SafetyCertificateOutlined /> Demo mode
              </span>
            </div>
            <p className="uc-meta" style={{ margin: '0 0 12px' }}>
              Each persona sees only what its role may see. Choose one to sign in.
            </p>
            <PersonaCards activeEmail={user?.email} loadingPersonaId={loadingPersonaId} onSelectPersona={handlePersonaLogin} />
          </section>
        )}

        <section aria-labelledby="officer-heading">
          <div className="uc-login-section-head">
            <h2 id="officer-heading">Officer authentication</h2>
          </div>
          <div className="uc-section uc-section-body">
            <Form
              name="officer_login"
              layout="vertical"
              initialValues={
                env.VITE_DEMO_MODE
                  ? { email: env.VITE_DEMO_EMAIL || 'senior@aicte.example', password: getDemoPassword() }
                  : { email: '', password: '' }
              }
              onFinish={handleFormSubmit}
              requiredMark={false}
            >
              <Form.Item
                name="email"
                label="Official email"
                rules={[
                  { required: true, message: 'Please enter your official email' },
                  { type: 'email', message: 'Please enter a valid email address' },
                ]}
              >
                <Input
                  prefix={<MailOutlined style={{ color: 'var(--uc-text-2)' }} />}
                  placeholder="officer@aicte.example"
                  autoComplete="username"
                  disabled={formSubmitting || !!loadingPersonaId}
                />
              </Form.Item>
              <Form.Item name="password" label="Password" rules={[{ required: true, message: 'Please enter your password' }]}>
                <Input.Password
                  prefix={<LockOutlined style={{ color: 'var(--uc-text-2)' }} />}
                  placeholder="••••••••••••"
                  autoComplete="current-password"
                  disabled={formSubmitting || !!loadingPersonaId}
                />
              </Form.Item>
              <Form.Item style={{ marginBottom: 0 }}>
                <Button type="primary" htmlType="submit" block loading={formSubmitting} disabled={!!loadingPersonaId}>
                  Sign in to portal
                </Button>
              </Form.Item>
            </Form>
          </div>
        </section>

        <p className="uc-meta" style={{ textAlign: 'center', marginTop: 24 }}>
          Protected system. All activity is logged in line with the IT Act and AICTE vigilance guidelines.
        </p>
      </div>
    </main>
  );
};

export default LoginPage;
