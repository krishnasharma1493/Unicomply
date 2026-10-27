import type { ThemeConfig } from 'antd';
import type { Role } from './lib/api/enums';

/**
 * Design Tokens & Theme Configuration for Unicomply (AICTE).
 * Centralized theme applied via Ant Design's <ConfigProvider>.
 *
 * Palette:
 * - Primary: Deep Indigo / Navy (#1e3a8a) - calm, authoritative government compliance
 * - Neutral surfaces: Slate / Gray (#f8fafc, #f1f5f9)
 * - Accent: Sky Blue (#0284c7)
 * - Semantic alerts: Success (#16a34a), Warning (#d97706), Error (#dc2626)
 */

export const themeConfig: ThemeConfig = {
  token: {
    colorPrimary: '#1e3a8a',
    colorPrimaryHover: '#1d4ed8',
    colorPrimaryActive: '#172554',
    colorInfo: '#0284c7',
    colorSuccess: '#16a34a',
    colorWarning: '#d97706',
    colorError: '#dc2626',
    colorBgBase: '#ffffff',
    colorBgLayout: '#f8fafc',
    colorTextBase: '#0f172a',
    colorTextSecondary: '#475569',
    colorBorder: '#e2e8f0',
    colorBorderSecondary: '#f1f5f9',
    borderRadius: 8,
    borderRadiusLG: 10,
    borderRadiusSM: 6,
    fontFamily:
      "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif",
    fontSize: 14,
    lineHeight: 1.5,
    boxShadowSecondary: '0 4px 6px -1px rgba(0, 0, 0, 0.08), 0 2px 4px -2px rgba(0, 0, 0, 0.04)',
  },
  components: {
    Layout: {
      headerBg: '#ffffff',
      headerPadding: '0 24px',
      headerHeight: 60,
      siderBg: '#0f172a', // Dark slate for sidebar navigation
      bodyBg: '#f8fafc',
    },
    Menu: {
      darkItemBg: '#0f172a',
      darkItemSelectedBg: '#1e3a8a',
      darkItemColor: '#94a3b8',
      darkItemSelectedColor: '#ffffff',
      darkItemHoverBg: '#1e293b',
      darkItemHoverColor: '#f8fafc',
      itemBorderRadius: 6,
      itemMarginInline: 8,
    },
    Card: {
      headerFontSize: 16,
      headerHeight: 48,
    },
    Table: {
      headerBg: '#f1f5f9',
      headerColor: '#1e293b',
      headerSplitColor: '#e2e8f0',
      rowHoverBg: '#f8fafc',
      borderColor: '#e2e8f0',
    },
    Button: {
      controlHeight: 36,
      borderRadius: 6,
      fontWeight: 500,
    },
    Tag: {
      borderRadiusSM: 4,
    },
    Select: {
      controlHeight: 36,
      borderRadius: 6,
    },
  },
};

/**
 * Distinct role colors for persona avatars, role tags, and identity chips.
 */
export interface RoleTheme {
  primary: string;
  bgLight: string;
  borderColor: string;
  badgeTag: string;
  label: string;
}

export const ROLE_THEMES: Record<Role, RoleTheme> = {
  senior_mgmt: {
    primary: '#1e3a8a', // Deep Indigo / Navy
    bgLight: '#eff6ff',
    borderColor: '#bfdbfe',
    badgeTag: 'geekblue',
    label: 'Senior Management',
  },
  bureau_head: {
    primary: '#0284c7', // Sky Blue (PGRC default) or Amber for RB
    bgLight: '#f0f9ff',
    borderColor: '#bae6fd',
    badgeTag: 'blue',
    label: 'Bureau Head',
  },
  ro_officer: {
    primary: '#0d9488', // Teal
    bgLight: '#f0fdfa',
    borderColor: '#99f6e4',
    badgeTag: 'cyan',
    label: 'Regional Officer',
  },
  intake_operator: {
    primary: '#7c3aed', // Violet / Purple
    bgLight: '#faf5ff',
    borderColor: '#e9d5ff',
    badgeTag: 'purple',
    label: 'Intake Operator',
  },
};

/**
 * Bureau code to display metadata lookup.
 */
export const BUREAU_CODE_MAP: Record<number, { code: string; name: string; kind?: 'bureau' | 'cell' | 'regional_office' }> = {
  1: { code: 'RB', name: 'Regulation Bureau', kind: 'bureau' },
  2: { code: 'PGRC', name: 'Public Grievance Redressal Cell', kind: 'cell' },
  3: { code: 'AB', name: 'Approval Bureau', kind: 'bureau' },
  4: { code: 'ACAD', name: 'Academic Bureau', kind: 'bureau' },
  5: { code: 'RO-CRO', name: 'Central Regional Office', kind: 'regional_office' },
  6: { code: 'RO-ERO', name: 'Eastern Regional Office', kind: 'regional_office' },
  7: { code: 'RO-NERO', name: 'North-Eastern Regional Office', kind: 'regional_office' },
  8: { code: 'RO-NRO', name: 'Northern Regional Office', kind: 'regional_office' },
  9: { code: 'RO-NWRO', name: 'North-Western Regional Office', kind: 'regional_office' },
  10: { code: 'RO-SRO', name: 'Southern Regional Office', kind: 'regional_office' },
  11: { code: 'RO-SCRO', name: 'South-Central Regional Office', kind: 'regional_office' },
  12: { code: 'RO-SWRO', name: 'South-Western Regional Office', kind: 'regional_office' },
  13: { code: 'RO-WRO', name: 'Western Regional Office', kind: 'regional_office' },
};
