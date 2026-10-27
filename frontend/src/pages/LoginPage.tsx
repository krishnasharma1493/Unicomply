import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Card,
  Typography,
  Space,
  Tag,
  Form,
  Input,
  Button,
  Alert,
  Divider,
} from 'antd';
import {
  LockOutlined,
  MailOutlined,
  SafetyCertificateOutlined,
  BankOutlined,
  LoginOutlined,
} from '@ant-design/icons';
import { useAuth } from '../auth/AuthProvider';
import { env } from '../lib/env';
import { PersonaCards } from '../features/auth/PersonaCards';
import { getDemoPassword, type Persona } from '../features/auth/personas';

const { Title, Paragraph, Text } = Typography;

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
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#f1f5f9',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '32px 16px',
      }}
    >
      {/* Official Government Header Banner */}
      <div
        style={{
          width: '100%',
          maxWidth: '1000px',
          textAlign: 'center',
          marginBottom: '28px',
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: '#ffffff',
            padding: '6px 14px',
            borderRadius: '20px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
            marginBottom: '16px',
          }}
        >
          <BankOutlined style={{ color: '#1e3a8a', fontSize: '15px' }} />
          <Text strong style={{ color: '#1e3a8a', fontSize: '12px', letterSpacing: '0.04em' }}>
            ALL INDIA COUNCIL FOR TECHNICAL EDUCATION (AICTE)
          </Text>
        </div>

        <Title
          level={2}
          style={{
            margin: '0 0 6px 0',
            color: '#0f172a',
            fontWeight: 700,
            letterSpacing: '-0.02em',
          }}
        >
          UNICOMPLY PORTAL
        </Title>
        <Paragraph
          type="secondary"
          style={{
            fontSize: '15px',
            maxWidth: '620px',
            margin: '0 auto',
            color: '#475569',
          }}
        >
          Integrated Grievance Redressal, Overlap Detection & Compliance Monitoring
        </Paragraph>
      </div>

      <div
        style={{
          width: '100%',
          maxWidth: env.VITE_DEMO_MODE ? '1000px' : '440px',
        }}
      >
        {errorMessage && (
          <Alert
            title="Sign-in Error"
            description={errorMessage}
            type="error"
            showIcon
            closable
            onClose={() => setErrorMessage(null)}
            style={{ marginBottom: '20px', borderRadius: '8px' }}
          />
        )}

        {/* Persona Quick Access (Demo Mode only) */}
        {env.VITE_DEMO_MODE && (
          <div style={{ marginBottom: '28px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '8px',
                marginBottom: '16px',
              }}
            >
              <div>
                <Title level={4} style={{ margin: 0, color: '#1e293b' }}>
                  Demo Persona One-Click Access
                </Title>
                <Text type="secondary" style={{ fontSize: '13px' }}>
                  Choose any simulated officer role to explore dashboard permissions and workflows
                </Text>
              </div>

              <Space>
                <Tag color="cyan" icon={<SafetyCertificateOutlined />}>
                  Demo Mode Active
                </Tag>
              </Space>
            </div>

            <PersonaCards
              activeEmail={user?.email}
              loadingPersonaId={loadingPersonaId}
              onSelectPersona={handlePersonaLogin}
            />

            <Divider style={{ margin: '32px 0 24px 0', borderColor: '#cbd5e1' }}>
              <Text type="secondary" style={{ fontSize: '12px', textTransform: 'uppercase' }}>
                Or Sign In with Credentials
              </Text>
            </Divider>
          </div>
        )}

        {/* Credentials Form Card */}
        <Card
          style={{
            maxWidth: '460px',
            margin: '0 auto',
            borderRadius: '8px',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
            border: '1px solid #e2e8f0',
          }}
          styles={{ body: { padding: '28px' } }}
        >
          <div style={{ textAlign: 'center', marginBottom: '20px' }}>
            <Title level={4} style={{ margin: '0 0 4px 0', color: '#0f172a' }}>
              Officer Authentication
            </Title>
            <Text type="secondary" style={{ fontSize: '13px' }}>
              Enter official AICTE portal credentials
            </Text>
          </div>

          <Form
            name="officer_login"
            layout="vertical"
            initialValues={{
              email: env.VITE_DEMO_EMAIL || 'senior@aicte.example',
              password: getDemoPassword(),
            }}
            onFinish={handleFormSubmit}
            requiredMark={false}
          >
            <Form.Item
              name="email"
              label={<Text strong style={{ fontSize: '13px' }}>Official Email</Text>}
              rules={[
                { required: true, message: 'Please enter your official email' },
                { type: 'email', message: 'Please enter a valid email address' },
              ]}
            >
              <Input
                prefix={<MailOutlined style={{ color: '#94a3b8' }} />}
                placeholder="officer@aicte.example"
                size="large"
                disabled={formSubmitting || !!loadingPersonaId}
              />
            </Form.Item>

            <Form.Item
              name="password"
              label={<Text strong style={{ fontSize: '13px' }}>Password</Text>}
              rules={[{ required: true, message: 'Please enter your password' }]}
            >
              <Input.Password
                prefix={<LockOutlined style={{ color: '#94a3b8' }} />}
                placeholder="••••••••••••"
                size="large"
                disabled={formSubmitting || !!loadingPersonaId}
              />
            </Form.Item>

            <Form.Item style={{ marginTop: '24px', marginBottom: '0' }}>
              <Button
                type="primary"
                htmlType="submit"
                size="large"
                block
                loading={formSubmitting}
                disabled={!!loadingPersonaId}
                icon={<LoginOutlined />}
                style={{
                  backgroundColor: '#1e3a8a',
                  height: '42px',
                  fontWeight: 600,
                  fontSize: '14px',
                }}
              >
                Sign In to Portal
              </Button>
            </Form.Item>
          </Form>
        </Card>

        {/* Footer info */}
        <div
          style={{
            marginTop: '28px',
            textAlign: 'center',
            fontSize: '12px',
            color: '#64748b',
          }}
        >
          <Text type="secondary" style={{ fontSize: '12px' }}>
            Protected System · All activities are logged and monitored in compliance with IT Act & AICTE Vigilance guidelines.
          </Text>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
