import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout, Space, Avatar, Typography, Button, Tooltip } from 'antd';
import {
  LogoutOutlined,
  MenuUnfoldOutlined,
  MenuFoldOutlined,
  BankOutlined,
} from '@ant-design/icons';
import { useAuth } from '../../auth/AuthProvider';
import { AlertBell } from '../../features/alerts/AlertBell';
import { PersonaSwitcher } from './PersonaSwitcher';
import { findPersonaByEmail } from '../../features/auth/personas';
import { ROLE_THEMES } from '../../theme';

const { Header } = Layout;
const { Text } = Typography;

export interface AppHeaderProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  isMobile: boolean;
  onOpenMobileMenu: () => void;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  collapsed,
  onToggleCollapse,
  isMobile,
  onOpenMobileMenu,
}) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const persona = user ? findPersonaByEmail(user.email) : undefined;
  const roleTheme = user?.role ? ROLE_THEMES[user.role] : undefined;

  const avatarColor = persona?.avatarColor ?? roleTheme?.primary ?? '#1e3a8a';
  const initials = persona?.initials ?? user?.name?.slice(0, 2).toUpperCase() ?? 'OF';

  return (
    <Header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 20px',
        backgroundColor: '#ffffff',
        borderBottom: '1px solid #e2e8f0',
        height: '60px',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.04)',
      }}
    >
      {/* Left: Collapse toggle + Brand identity */}
      <Space orientation="horizontal" size={14}>
        {isMobile ? (
          <Button
            type="text"
            icon={<MenuUnfoldOutlined style={{ fontSize: '18px' }} />}
            onClick={onOpenMobileMenu}
            aria-label="Open navigation menu"
          />
        ) : (
          <Button
            type="text"
            icon={
              collapsed ? (
                <MenuUnfoldOutlined style={{ fontSize: '16px' }} />
              ) : (
                <MenuFoldOutlined style={{ fontSize: '16px' }} />
              )
            }
            onClick={onToggleCollapse}
            aria-label="Toggle navigation sidebar"
          />
        )}

        <div
          onClick={() => navigate('/')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            cursor: 'pointer',
            userSelect: 'none',
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 6,
              backgroundColor: '#1e3a8a',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 4px rgba(30, 58, 138, 0.25)',
            }}
          >
            <BankOutlined style={{ fontSize: '17px' }} />
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span
                style={{
                  fontWeight: 700,
                  fontSize: '16px',
                  letterSpacing: '0.02em',
                  color: '#0f172a',
                  lineHeight: 1.1,
                }}
              >
                UNICOMPLY
              </span>
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  backgroundColor: '#eff6ff',
                  color: '#1e3a8a',
                  padding: '1px 5px',
                  borderRadius: '4px',
                  border: '1px solid #bfdbfe',
                }}
              >
                AICTE
              </span>
            </div>
            {!isMobile && (
              <span
                style={{
                  fontSize: '11px',
                  color: '#64748b',
                  display: 'block',
                  lineHeight: 1,
                  marginTop: '2px',
                }}
              >
                Integrated Compliance Portal
              </span>
            )}
          </div>
        </div>
      </Space>

      {/* Right: Switcher, Alerts, User chip, Logout */}
      <Space orientation="horizontal" size={isMobile ? 8 : 16}>
        <PersonaSwitcher />

        <AlertBell />

        {/* User Identity Chip */}
        {user && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '4px 8px',
              borderRadius: '6px',
              background: '#f8fafc',
              border: '1px solid #f1f5f9',
            }}
          >
            <Avatar
              size={28}
              style={{
                backgroundColor: avatarColor,
                color: '#ffffff',
                fontWeight: 600,
                fontSize: '12px',
              }}
            >
              {initials}
            </Avatar>

            {!isMobile && (
              <div style={{ textAlign: 'left', lineHeight: 1.2 }}>
                <div style={{ fontWeight: 600, fontSize: '13px', color: '#0f172a' }}>
                  {user.name}
                </div>
                <Text type="secondary" style={{ fontSize: '11px' }}>
                  {persona?.title ?? roleTheme?.label ?? user.role}
                </Text>
              </div>
            )}
          </div>
        )}

        {/* Sign Out Button */}
        <Tooltip title="Sign Out">
          <Button
            type="text"
            icon={<LogoutOutlined style={{ color: '#64748b' }} />}
            onClick={() => {
              logout();
              navigate('/login');
            }}
            aria-label="Sign out"
          >
            {!isMobile && 'Sign Out'}
          </Button>
        </Tooltip>
      </Space>
    </Header>
  );
};

export default AppHeader;
