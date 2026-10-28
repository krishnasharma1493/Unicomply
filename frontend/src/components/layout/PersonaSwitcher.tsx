import React, { useState } from 'react';
import { Select, message } from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../auth/AuthProvider';
import { env } from '../../lib/env';
import {
  PERSONAS,
  findPersonaByEmail,
  getDemoPassword,
} from '../../features/auth/personas';

/** Demo-only: switch persona from the toolbar without signing out (PRD §8 demo-mode rule). */
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
    <div className="uc-persona">
      <span className="uc-persona-label">Persona:</span>
      <Select
        aria-label="Persona"
        value={currentVal}
        onChange={handleSelect}
        loading={switching}
        disabled={switching}
        variant="borderless"
        popupMatchSelectWidth={false}
        placement="bottomRight"
        styles={{ popup: { root: { minWidth: 320, padding: 6 } } }}
        style={{ minWidth: 150 }}
        labelRender={() => (
          <span className="uc-persona-value">{currentPersona?.title ?? user?.name ?? 'Custom officer'}</span>
        )}
        options={PERSONAS.map((p) => ({
          value: p.id,
          label: (
            <div className="uc-persona-option">
              <span className="uc-persona-initials" aria-hidden="true">{p.initials}</span>
              <span>
                <span className="uc-persona-name">{p.name}</span>
                <span className="uc-meta">{p.title} · {p.bureau}</span>
              </span>
            </div>
          ),
        }))}
      />
    </div>
  );
};

export default PersonaSwitcher;
