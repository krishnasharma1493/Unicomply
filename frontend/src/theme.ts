import { theme as antTheme, type ThemeConfig } from 'antd';
import type { Role } from './lib/api/enums';

/**
 * Design tokens for Unicomply, applied through Ant Design's <ConfigProvider>.
 * The rationale lives in docs/design/DIRECTION.md; the CSS variables in index.css mirror these values
 * for the parts Ant Design does not theme (glass, scroll edges, focus, reduced transparency).
 *
 * Restrained colour: cool paper neutrals plus one accent, a deep registry ink (#0b5e6b). Red, amber and green are semantic only and always
 * travel with a word or an icon.
 */
export const palette = {
  canvas: '#f2f3f1',
  surface: '#ffffff',
  text: '#1b1f1d',
  textSecondary: '#5b625e',
  hairline: 'rgba(0, 0, 0, 0.08)',
  border: '#cfd3d0',
  accent: '#0b5e6b',
  accentText: '#0b5e6b',
  accentTint: 'rgba(11, 94, 107, 0.09)',
  red: '#b42318',
  redText: '#b42318',
  redTint: '#fdf1ef',
  amber: '#9a5300',
  amberText: '#8a4b00',
  amberTint: '#fdf5e7',
  green: '#1d7a34',
  /** Chart ink for neutral series: readable on white, quieter than the accent. */
  chartNeutral: '#8a918d',
} as const;

const fontFamily =
  '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, "Helvetica Neue", "Noto Sans", "Noto Sans Devanagari", Arial, sans-serif';

/** Ant Design's own motion is switched off when the user asks for reduced motion. */
export function buildTheme({ reducedMotion = false }: { reducedMotion?: boolean } = {}): ThemeConfig {
  return {
    algorithm: antTheme.defaultAlgorithm,
    token: {
      colorPrimary: palette.accent,
      colorInfo: palette.accent,
      colorLink: palette.accentText,
      colorLinkHover: '#084a54',
      colorSuccess: palette.green,
      colorWarning: palette.amber,
      colorError: palette.red,
      colorTextBase: palette.text,
      colorText: palette.text,
      colorTextSecondary: palette.textSecondary,
      colorTextTertiary: palette.textSecondary,
      colorTextDescription: palette.textSecondary,
      colorTextPlaceholder: '#646b67',
      colorBgBase: '#ffffff',
      colorBgLayout: palette.canvas,
      colorBgContainer: palette.surface,
      colorBorder: palette.border,
      colorBorderSecondary: '#e3e6e3',
      colorSplit: palette.hairline,
      colorFillAlter: '#f9faf8',
      fontFamily,
      fontSize: 14,
      lineHeight: 1.5,
      fontSizeHeading1: 28,
      fontSizeHeading2: 22,
      fontSizeHeading3: 18,
      fontSizeHeading4: 15,
      fontSizeHeading5: 14,
      lineHeightHeading1: 1.1,
      lineHeightHeading2: 1.18,
      lineHeightHeading3: 1.25,
      fontWeightStrong: 600,
      borderRadius: 6,
      borderRadiusLG: 8,
      borderRadiusSM: 4,
      borderRadiusXS: 3,
      controlHeight: 34,
      controlHeightLG: 40,
      controlHeightSM: 26,
      lineWidthFocus: 3,
      boxShadow: '0 8px 28px rgba(0, 0, 0, 0.12), 0 1px 3px rgba(0, 0, 0, 0.06)',
      boxShadowSecondary: '0 12px 32px rgba(0, 0, 0, 0.14), 0 2px 6px rgba(0, 0, 0, 0.06)',
      motion: !reducedMotion,
      motionDurationFast: '0.12s',
      motionDurationMid: '0.2s',
      motionDurationSlow: '0.28s',
      motionEaseOut: 'cubic-bezier(0.22, 1, 0.36, 1)',
      motionEaseInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
    },
    components: {
      Layout: {
        bodyBg: palette.canvas,
        headerBg: 'transparent',
        siderBg: 'transparent',
        headerHeight: 52,
        headerPadding: '0 24px',
      },
      Menu: {
        itemBg: 'transparent',
        subMenuItemBg: 'transparent',
        itemColor: palette.text,
        itemHoverColor: palette.text,
        itemHoverBg: 'rgba(0, 0, 0, 0.05)',
        itemActiveBg: 'rgba(0, 0, 0, 0.08)',
        itemSelectedBg: palette.accentTint,
        itemSelectedColor: palette.accentText,
        itemBorderRadius: 6,
        itemHeight: 34,
        itemMarginInline: 10,
        itemMarginBlock: 2,
        iconSize: 15,
        collapsedIconSize: 16,
        activeBarBorderWidth: 0,
      },
      Card: {
        headerFontSize: 15,
        headerFontSizeSM: 15,
        headerHeight: 48,
        headerHeightSM: 44,
        bodyPadding: 20,
        bodyPaddingSM: 16,
        headerPadding: 20,
        headerPaddingSM: 16,
      },
      Table: {
        headerBg: palette.surface,
        headerColor: palette.textSecondary,
        headerSplitColor: 'transparent',
        headerSortActiveBg: '#f2f3f1',
        rowHoverBg: '#f6f7f5',
        rowSelectedBg: '#e7f0f1',
        borderColor: 'rgba(0, 0, 0, 0.07)',
        cellPaddingBlock: 12,
        cellPaddingInline: 14,
        cellPaddingBlockSM: 9,
        cellPaddingInlineSM: 12,
        headerBorderRadius: 0,
      },
      Button: {
        fontWeight: 500,
        primaryShadow: 'none',
        defaultShadow: 'none',
        dangerShadow: 'none',
        defaultBorderColor: palette.border,
        paddingInline: 14,
      },
      Tag: {
        defaultBg: '#eceeeb',
        defaultColor: '#2e3431',
      },
      Tabs: {
        itemColor: palette.textSecondary,
        itemSelectedColor: palette.text,
        itemHoverColor: palette.text,
        inkBarColor: palette.text,
        titleFontSize: 14,
        horizontalItemPadding: '10px 0',
        horizontalItemGutter: 28,
      },
      Input: {
        activeShadow: '0 0 0 3px rgba(11, 94, 107, 0.22)',
        errorActiveShadow: '0 0 0 3px rgba(215, 0, 21, 0.18)',
        paddingInline: 11,
      },
      Select: {
        activeOutlineColor: 'rgba(11, 94, 107, 0.22)',
        optionSelectedBg: palette.accentTint,
        optionSelectedColor: palette.accentText,
        optionActiveBg: 'rgba(0, 0, 0, 0.05)',
      },
      DatePicker: {
        activeShadow: '0 0 0 3px rgba(11, 94, 107, 0.22)',
      },
      Modal: {
        titleFontSize: 17,
        contentBg: 'transparent',
        headerBg: 'transparent',
        footerBg: 'transparent',
      },
      Progress: {
        defaultColor: palette.accent,
        remainingColor: 'rgba(0, 0, 0, 0.08)',
      },
      Alert: {
        withDescriptionPadding: '14px 18px',
      },
      Pagination: {
        itemActiveBg: palette.accentTint,
      },
      Timeline: {
        dotBg: palette.surface,
        tailColor: 'rgba(0, 0, 0, 0.1)',
      },
      Descriptions: {
        labelBg: 'transparent',
        labelColor: palette.textSecondary,
      },
      Segmented: {
        itemSelectedBg: palette.surface,
        trackBg: 'rgba(0, 0, 0, 0.06)',
      },
    },
  };
}

export const themeConfig: ThemeConfig = buildTheme();

/**
 * Role identity for avatars and labels. Identity is carried by words and initials, not by hue,
 * so every role shares the same neutral avatar.
 */
export interface RoleTheme {
  primary: string;
  bgLight: string;
  borderColor: string;
  badgeTag: string;
  label: string;
}

const neutralRole = { primary: '#5b625e', bgLight: '#f2f3f1', borderColor: '#cfd3d0', badgeTag: 'default' };

export const ROLE_THEMES: Record<Role, RoleTheme> = {
  senior_mgmt: { ...neutralRole, label: 'Senior Management' },
  bureau_head: { ...neutralRole, label: 'Bureau Head' },
  ro_officer: { ...neutralRole, label: 'Regional Officer' },
  intake_operator: { ...neutralRole, label: 'Intake Operator' },
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
