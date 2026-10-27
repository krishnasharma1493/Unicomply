import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
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
    visible: (role) => role === 'intake_operator',
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

export const AppSidebar: React.FC<AppSidebarProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const role = user?.role;
  const isAdmin = user?.is_admin;

  const menuItems: ItemType[] = NAV_ITEMS.filter((item) =>
    item.visible(role, isAdmin),
  ).map((item) => ({
    key: item.path,
    icon: item.icon,
    label: item.label,
  }));

  // Determine active key: exact match or prefix
  let selectedKey = location.pathname;
  if (selectedKey !== '/' && selectedKey.endsWith('/')) {
    selectedKey = selectedKey.slice(0, -1);
  }
  // Check if current path matches or is child
  const matchingItem = NAV_ITEMS.find((item) => {
    if (item.path === '/') return location.pathname === '/';
    return location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
  });

  return (
    <Menu
      theme="dark"
      mode="inline"
      selectedKeys={[matchingItem ? matchingItem.path : selectedKey]}
      items={menuItems}
      onClick={({ key }) => {
        navigate(key);
        if (onNavigate) {
          onNavigate();
        }
      }}
      style={{
        borderRight: 0,
        paddingTop: '8px',
      }}
    />
  );
};

export default AppSidebar;
