import React, { useState } from 'react';
import { Select, Avatar, Space, Tag, Typography, message } from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../auth/AuthProvider';
import { env } from '../../lib/env';
import {
  PERSONAS,
  findPersonaByEmail,
  getDemoPassword,
} from '../../features/auth/personas';

const { Text } = Typography;

export const PersonaSwitcher: React.FC = () => {
  const { user, login } = useAuth();
  const queryClient = useQueryClient();
  const [switching, setSwitching] = useState(false);

  // Hidden when demo mode is inactive
  if (!env.VITE_DEMO_MODE) {
    return null;
  }

  const currentPersona = user ? findPersonaByEmail(user.email) : undefined;
  const currentVal = currentPersona?.id ?? 'custom';

  const handleSelect = async (personaId: string) => {
    const targetPersona = PERSONAS.find((p) => p.id === personaId);
    if (!targetPersona || targetPersona.email === user?.email) {
      return;
    }

    setSwitching(true);
    try {
      await login(targetPersona.email, getDemoPassword());
      // Invalidate queries so that dashboard, cases, etc. refetch under the new role context
      await queryClient.invalidateQueries();
      message.success(`Switched persona to ${targetPersona.name} (${targetPersona.roleLabel})`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to switch persona';
      message.error(msg);
    } finally {
      setSwitching(false);
    }
  };

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        background: '#f1f5f9',
        borderRadius: '24px',
        padding: '2px 4px 2px 8px',
        border: '1px solid #cbd5e1',
      }}
    >
      <Text
        type="secondary"
        style={{
          fontSize: '11px',
          fontWeight: 600,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          marginRight: '6px',
          color: '#64748b',
        }}
      >
        Persona:
      </Text>

      <Select
        value={currentVal}
        onChange={handleSelect}
        loading={switching}
        disabled={switching}
        variant="borderless"
        popupMatchSelectWidth={false}
        styles={{ popup: { root: { minWidth: '320px', borderRadius: '8px', padding: '6px' } } }}
        style={{ minWidth: '190px' }}
        labelRender={() => {
          if (!currentPersona) {
            return (
              <Space orientation="horizontal" size={6}>
                <Avatar size={22} style={{ backgroundColor: '#64748b' }}>
                  {user?.name?.[0]?.toUpperCase() ?? 'U'}
                </Avatar>
                <Text strong style={{ fontSize: '13px' }}>
                  {user?.name || 'Custom Officer'}
                </Text>
              </Space>
            );
          }
          return (
            <Space orientation="horizontal" size={6} style={{ overflow: 'hidden' }}>
              <Avatar
                size={22}
                style={{
                  backgroundColor: currentPersona.avatarColor,
                  color: '#ffffff',
                  fontSize: '11px',
                  fontWeight: 600,
                }}
              >
                {currentPersona.initials}
              </Avatar>
              <Text strong style={{ fontSize: '13px', color: '#0f172a' }}>
                {currentPersona.name}
              </Text>
              <Tag
                color={currentPersona.tagColor}
                style={{
                  margin: 0,
                  fontSize: '10px',
                  lineHeight: '16px',
                  padding: '0 4px',
                  fontWeight: 500,
                }}
              >
                {currentPersona.roleLabel}
              </Tag>
            </Space>
          );
        }}
        options={PERSONAS.map((p) => ({
          value: p.id,
          label: (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '4px 0',
                gap: '12px',
              }}
            >
              <Space orientation="horizontal" size={10}>
                <Avatar
                  size={28}
                  style={{
                    backgroundColor: p.avatarColor,
                    color: '#ffffff',
                    fontSize: '12px',
                    fontWeight: 600,
                  }}
                >
                  {p.initials}
                </Avatar>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '13px', color: '#0f172a', lineHeight: 1.2 }}>
                    {p.name}
                  </div>
                  <Text type="secondary" style={{ fontSize: '11px' }}>
                    {p.title} · {p.bureau}
                  </Text>
                </div>
              </Space>

              <Tag
                color={p.tagColor}
                style={{
                  margin: 0,
                  fontSize: '10px',
                  fontWeight: 500,
                  lineHeight: '18px',
                  padding: '0 6px',
                }}
              >
                {p.roleLabel}
              </Tag>
            </div>
          ),
        }))}
      />
    </div>
  );
};

export default PersonaSwitcher;
