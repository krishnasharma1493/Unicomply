import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu } from 'antd';
import type { ItemType } from 'antd/es/menu/interface';
import {
  DashboardOutlined,
  FolderOutlined,
  PlusCircleOutlined,
  CheckSquareOutlined,
  BranchesOutlined,
  BankOutlined,
  BellOutlined,
  BarChartOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { useAuth } from '../../auth/AuthProvider';

export interface AppSidebarProps {
  collapsed?: boolean;
  onNavigate?: () => void;
  /** The mobile drawer already titles itself. */
  hideBrand?: boolean;
}

interface NavItemDef {
  key: string;
  path: string;
  label: string;
  icon: React.ReactNode;
  visible: (role?: string, isAdmin?: boolean) => boolean;
}

const NAV_ITEMS: NavItemDef[] = [
  {
    key: '/',
    path: '/',
    label: 'Dashboard',
    icon: <DashboardOutlined />,
    visible: () => true,
  },
  {
    key: '/cases',
    path: '/cases',
    label: 'Cases',
    icon: <FolderOutlined />,
    visible: () => true,
  },
  {
    key: '/cases/new',
    path: '/cases/new',
    label: 'Case Intake',
    icon: <PlusCircleOutlined />,
    visible: (role) => role === 'intake_operator' || role === 'bureau_head' || role === 'senior_mgmt',
  },
  {
    key: '/reviews',
    path: '/reviews',
    label: 'Match Review',
    icon: <CheckSquareOutlined />,
    // PRD §5/§7 "intake, admin"; the backend's GET /reviews allows intake_operator and senior_mgmt.
    visible: (role) => role === 'intake_operator' || role === 'senior_mgmt',
  },
  {
    key: '/overlaps',
    path: '/overlaps',
    label: 'Overlap Center',
    icon: <BranchesOutlined />,
    visible: (role) => role === 'bureau_head' || role === 'senior_mgmt',
  },
  {
    key: '/institutions',
    path: '/institutions',
    label: 'Institutions',
    icon: <BankOutlined />,
    visible: () => true,
  },
  {
    key: '/alerts',
    path: '/alerts',
    label: 'Alerts',
    icon: <BellOutlined />,
    visible: () => true,
  },
  {
    key: '/reports',
    path: '/reports',
    label: 'Reports',
    icon: <BarChartOutlined />,
    visible: (role) => role === 'bureau_head' || role === 'senior_mgmt',
  },
  {
    key: '/admin',
    path: '/admin',
    label: 'System Admin',
    icon: <SettingOutlined />,
    visible: (role, isAdmin) => role === 'senior_mgmt' && Boolean(isAdmin),
  },
];

const GROUPS: { label: string; keys: string[] }[] = [
  { label: 'Casework', keys: ['/', '/cases', '/cases/new', '/reviews', '/overlaps'] },
  { label: 'Records', keys: ['/institutions', '/alerts', '/reports'] },
  { label: 'Administration', keys: ['/admin'] },
];

/** The nav item that owns a path: the longest matching prefix, so /cases/new is Case Intake, not Cases. */
export function activeNavKey(pathname: string): string | undefined {
  const path = pathname !== '/' && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  return NAV_ITEMS.filter((item) =>
    item.path === '/' ? path === '/' : path === item.path || path.startsWith(`${item.path}/`),
  ).sort((a, b) => b.path.length - a.path.length)[0]?.path;
}

export const AppSidebar: React.FC<AppSidebarProps> = ({ collapsed = false, onNavigate, hideBrand = false }) => {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const role = user?.role;
  const isAdmin = user?.is_admin;
  const visible = NAV_ITEMS.filter((item) => item.visible(role, isAdmin));
  // /cases/new must light up Case Intake only when the user can see that item.
  const selected = activeNavKey(location.pathname);
  const selectedKey = visible.some((v) => v.path === selected) ? selected : activeNavKey(location.pathname.replace(/\/new$/, ''));

  const menuItems: ItemType[] = GROUPS.map((group) => {
    const children = visible
      .filter((item) => group.keys.includes(item.path))
      .map((item) => ({ key: item.path, icon: item.icon, label: item.label, title: item.label }));
    return children.length ? { type: 'group' as const, key: group.label, label: collapsed ? null : group.label, children } : null;
  }).filter((g): g is NonNullable<typeof g> => g !== null);

  return (
    <nav aria-label="Main navigation" className="uc-nav">
      {!hideBrand && (
        <Link to="/" className="uc-brand" aria-label="Unicomply, AICTE complaint monitoring: home">
          <span className="uc-brand-name uc-brand-full">Unicomply</span>
          <span className="uc-brand-name uc-brand-short" aria-hidden="true">U</span>
          <span className="uc-brand-org">AICTE</span>
        </Link>
      )}
      <Menu
        mode="inline"
        inlineCollapsed={collapsed}
        selectedKeys={selectedKey ? [selectedKey] : []}
        items={menuItems}
        onClick={({ key }) => {
          navigate(key);
          onNavigate?.();
        }}
        style={{ borderInlineEnd: 0, background: 'transparent' }}
      />
    </nav>
  );
};

export default AppSidebar;
