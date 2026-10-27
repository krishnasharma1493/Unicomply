import React from 'react';
import { Card, Tag, Avatar, Space, Typography, Spin } from 'antd';
import { ArrowRightOutlined, CheckCircleFilled } from '@ant-design/icons';
import { PERSONAS, type Persona } from './personas';

const { Text } = Typography;

export interface PersonaCardsProps {
  activeEmail?: string | null;
  loadingPersonaId?: string | null;
  onSelectPersona: (persona: Persona) => void;
}

export const PersonaCards: React.FC<PersonaCardsProps> = ({
  activeEmail,
  loadingPersonaId,
  onSelectPersona,
}) => {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '16px',
        width: '100%',
      }}
    >
      {PERSONAS.map((persona) => {
        const isActive = activeEmail?.toLowerCase() === persona.email.toLowerCase();
        const isLoading = loadingPersonaId === persona.id;

        return (
          <Card
            key={persona.id}
            hoverable
            tabIndex={0}
            role="button"
            aria-label={`Sign in as ${persona.name}, ${persona.roleLabel}`}
            onClick={() => {
              if (!loadingPersonaId) {
                onSelectPersona(persona);
              }
            }}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === ' ') && !loadingPersonaId) {
                e.preventDefault();
                onSelectPersona(persona);
              }
            }}
            styles={{
              body: {
                padding: '20px',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                position: 'relative',
              },
            }}
            style={{
              borderRadius: '8px',
              border: isActive ? `2px solid ${persona.avatarColor}` : '1px solid #e2e8f0',
              backgroundColor: isActive ? persona.avatarBgLight : '#ffffff',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
              cursor: loadingPersonaId ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          >
            {isLoading && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  backgroundColor: 'rgba(255, 255, 255, 0.8)',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 2,
                }}
              >
                <Spin description="Authenticating..." />
              </div>
            )}

            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  marginBottom: '12px',
                }}
              >
                <Space size={12}>
                  <Avatar
                    size={46}
                    style={{
                      backgroundColor: persona.avatarColor,
                      color: '#ffffff',
                      fontWeight: 600,
                      fontSize: '16px',
                      boxShadow: `0 2px 8px ${persona.avatarColor}40`,
                    }}
                  >
                    {persona.initials}
                  </Avatar>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '15px', color: '#0f172a' }}>
                      {persona.name}
                    </div>
                    <Text type="secondary" style={{ fontSize: '12px', display: 'block' }}>
                      {persona.title}
                    </Text>
                  </div>
                </Space>

                {isActive && (
                  <CheckCircleFilled style={{ color: persona.avatarColor, fontSize: '18px' }} />
                )}
              </div>

              <div style={{ marginBottom: '10px' }}>
                <Space size={6} wrap>
                  <Tag color={persona.tagColor} style={{ fontWeight: 500, margin: 0 }}>
                    {persona.roleLabel}
                  </Tag>
                  <Tag style={{ margin: 0, fontSize: '11px', color: '#475569' }}>
                    {persona.bureau}
                  </Tag>
                  {persona.isAdmin && (
                    <Tag color="gold" style={{ margin: 0, fontWeight: 500 }}>
                      Admin
                    </Tag>
                  )}
                </Space>
              </div>

              <Text
                type="secondary"
                style={{
                  fontSize: '12px',
                  lineHeight: '1.4',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  minHeight: '34px',
                }}
              >
                {persona.description}
              </Text>
            </div>

            <div
              style={{
                marginTop: '16px',
                paddingTop: '12px',
                borderTop: '1px solid #f1f5f9',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '12px',
                fontWeight: 500,
                color: persona.avatarColor,
              }}
            >
              <span>{persona.email}</span>
              <Space size={4}>
                <span>Sign In</span>
                <ArrowRightOutlined style={{ fontSize: '11px' }} />
              </Space>
            </div>
          </Card>
        );
      })}
    </div>
  );
};
