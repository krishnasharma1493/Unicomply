import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar, Button, Dropdown, Tooltip } from 'antd';
import { LogoutOutlined, MenuOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useAuth } from '../../auth/AuthProvider';
import { AlertBell } from '../../features/alerts/AlertBell';
import { PersonaSwitcher } from './PersonaSwitcher';
import { findPersonaByEmail } from '../../features/auth/personas';
import { ROLE_THEMES } from '../../theme';

export interface AppHeaderProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  isMobile: boolean;
  onOpenMobileMenu: () => void;
  /** Content has scrolled under the toolbar: show the scroll edge. */
  scrolled?: boolean;
  onOpenCommand?: () => void;
}

/** A sidebar glyph drawn to match the 16 px outline icon set. */
const SidebarIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <rect x="1.5" y="2.5" width="13" height="11" rx="2.5" stroke="currentColor" strokeWidth="1.2" />
    <path d="M6 2.75v10.5" stroke="currentColor" strokeWidth="1.2" />
  </svg>
);

const shortcutLabel =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘K' : 'Ctrl K';

export const AppHeader: React.FC<AppHeaderProps> = ({
  collapsed,
  onToggleCollapse,
  isMobile,
  onOpenMobileMenu,
  scrolled = false,
  onOpenCommand,
}) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const persona = user ? findPersonaByEmail(user.email) : undefined;
  const roleLabel = persona?.title ?? (user?.role ? ROLE_THEMES[user.role].label : undefined);
  const initials = persona?.initials ?? user?.name?.slice(0, 2).toUpperCase() ?? 'OF';

  const canCreate = user?.role === 'intake_operator' || user?.role === 'bureau_head' || user?.role === 'senior_mgmt';

  const signOut = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="uc-toolbar" data-scrolled={scrolled ? 'true' : 'false'}>
      <div className="uc-toolbar-group">
        {isMobile ? (
          <Button type="text" icon={<MenuOutlined />} onClick={onOpenMobileMenu} aria-label="Open navigation menu" />
        ) : (
          <Tooltip title={collapsed ? 'Show sidebar' : 'Hide sidebar'} mouseEnterDelay={0.6}>
            <Button
              type="text"
              icon={<SidebarIcon />}
              onClick={onToggleCollapse}
              aria-label="Toggle navigation sidebar"
              aria-expanded={!collapsed}
              style={{ color: 'var(--uc-text-2)' }}
            />
          </Tooltip>
        )}
        {isMobile && <span className="uc-brand-name">Unicomply</span>}
        {onOpenCommand && (
          <button type="button" className="uc-search-trigger uc-pressable" onClick={onOpenCommand} aria-label="Search cases, institutions and pages" aria-keyshortcuts="Meta+K Control+K">
            <SearchOutlined aria-hidden="true" />
            {!isMobile && <span>Search cases, institutions…</span>}
            {!isMobile && <kbd aria-hidden="true">{shortcutLabel}</kbd>}
          </button>
        )}
      </div>

      <div className="uc-toolbar-group">
        {canCreate && !isMobile && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/cases/new')}>
            New case
          </Button>
        )}
        <PersonaSwitcher />
        <AlertBell />
        {user && (
          <Dropdown
            trigger={['click']}
            placement="bottomRight"
            menu={{
              items: [
                {
                  key: 'who',
                  type: 'group',
                  label: (
                    <div className="uc-account">
                      <div className="uc-account-name">{user.name}</div>
                      <div className="uc-meta">{[roleLabel, user.email].filter(Boolean).join(' · ')}</div>
                    </div>
                  ),
                },
                { type: 'divider' },
                { key: 'signout', icon: <LogoutOutlined />, label: 'Sign out', onClick: signOut },
              ],
            }}
          >
            <button type="button" className="uc-account-trigger uc-pressable" aria-label={`Account: ${user.name}`}>
              <Avatar size={26} className="uc-avatar">{initials}</Avatar>
              {!isMobile && (
                <span className="uc-account-name">{user.name}</span>
              )}
            </button>
          </Dropdown>
        )}
      </div>
    </header>
  );
};

export default AppHeader;
