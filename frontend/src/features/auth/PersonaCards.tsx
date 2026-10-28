import React from 'react';
import { Spin } from 'antd';
import { CheckCircleFilled, RightOutlined } from '@ant-design/icons';
import { PERSONAS, type Persona } from './personas';

export interface PersonaCardsProps {
  activeEmail?: string | null;
  loadingPersonaId?: string | null;
  onSelectPersona: (persona: Persona) => void;
}

/**
 * The five demo personas (PRD §7 /login) as one grouped list: who they are, what they see, one press
 * to sign in. Identity is carried by name and role, not by colour.
 */
export const PersonaCards: React.FC<PersonaCardsProps> = ({ activeEmail, loadingPersonaId, onSelectPersona }) => (
  <ul className="uc-section uc-personas">
    {PERSONAS.map((persona) => {
      const isActive = activeEmail?.toLowerCase() === persona.email.toLowerCase();
      const isLoading = loadingPersonaId === persona.id;
      return (
        <li key={persona.id}>
          <button
            type="button"
            className="uc-persona-row uc-pressable"
            aria-label={`Sign in as ${persona.name}, ${persona.roleLabel}`}
            aria-busy={isLoading}
            disabled={Boolean(loadingPersonaId) && !isLoading}
            onClick={() => {
              if (!loadingPersonaId) onSelectPersona(persona);
            }}
          >
            <span className="uc-persona-initials uc-persona-initials--lg" aria-hidden="true">
              {persona.initials}
            </span>
            <span className="uc-persona-text">
              <span className="uc-persona-line">
                <span className="uc-persona-name">{persona.name}</span>
                <span className="uc-meta">{persona.title}</span>
                {persona.isAdmin && <span className="uc-label">Admin</span>}
              </span>
              <span className="uc-meta">{persona.bureau}</span>
              <span className="uc-persona-desc">{persona.description}</span>
            </span>
            <span className="uc-persona-go" aria-hidden="true">
              {isLoading ? <Spin size="small" /> : isActive ? <CheckCircleFilled style={{ color: 'var(--uc-accent)' }} /> : <RightOutlined />}
            </span>
          </button>
        </li>
      );
    })}
  </ul>
);
