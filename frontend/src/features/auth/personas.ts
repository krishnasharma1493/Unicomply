import type { Role, Region } from '../../lib/api/enums';
import { env } from '../../lib/env';

export interface Persona {
  id: string;
  email: string;
  name: string;
  title: string;
  role: Role;
  roleLabel: string;
  bureau: string;
  bureauId: number | null;
  region: Region | null;
  isAdmin: boolean;
  initials: string;
  avatarColor: string;
  avatarBgLight: string;
  tagColor: string;
  description: string;
}

export const PERSONAS: Persona[] = [
  {
    id: 'senior_mgmt',
    email: 'senior@aicte.example',
    name: 'Dr. Meera Raghavan',
    title: 'Senior Officer',
    role: 'senior_mgmt',
    roleLabel: 'Senior Management',
    bureau: 'AICTE HQ',
    bureauId: null,
    region: null,
    isAdmin: true,
    initials: 'MR',
    avatarColor: '#1e3a8a', // Deep Indigo / Navy
    avatarBgLight: '#eff6ff',
    tagColor: 'geekblue',
    description: 'Executive oversight, cross-bureau visibility, and system administration privileges.',
  },
  {
    id: 'pgrc_head',
    email: 'pgrc.head@aicte.example',
    name: 'Anil Deshmukh',
    title: 'PGRC Head',
    role: 'bureau_head',
    roleLabel: 'Bureau Head',
    bureau: 'Public Grievance Redressal Cell (PGRC)',
    bureauId: 2,
    region: null,
    isAdmin: false,
    initials: 'AD',
    avatarColor: '#0284c7', // Sky Blue
    avatarBgLight: '#f0f9ff',
    tagColor: 'blue',
    description: 'PGRC queue management, grievance triage, assignment, and escalation resolution.',
  },
  {
    id: 'rb_head',
    email: 'rb.head@aicte.example',
    name: 'Kavita Rao',
    title: 'RB Head',
    role: 'bureau_head',
    roleLabel: 'Bureau Head',
    bureau: 'Regulation Bureau (RB)',
    bureauId: 1,
    region: null,
    isAdmin: false,
    initials: 'KR',
    avatarColor: '#d97706', // Amber / Orange
    avatarBgLight: '#fffbeb',
    tagColor: 'orange',
    description: 'Regulatory compliance inquiries, norm violations, and multi-bureau overlap handling.',
  },
  {
    id: 'ro_nw',
    email: 'ro.nw@aicte.example',
    name: 'Rakesh Tiwari',
    title: 'North-Western RO Officer',
    role: 'ro_officer',
    roleLabel: 'Regional Officer',
    bureau: 'North-Western Regional Office (RO-NWRO)',
    bureauId: 9,
    region: 'north_western',
    isAdmin: false,
    initials: 'RT',
    avatarColor: '#0d9488', // Teal
    avatarBgLight: '#f0fdfa',
    tagColor: 'cyan',
    description: 'Field inspection, North-Western region institution oversight, and localized case updates.',
  },
  {
    id: 'intake',
    email: 'intake@aicte.example',
    name: 'Neha Joshi',
    title: 'Intake Operator',
    role: 'intake_operator',
    roleLabel: 'Intake Operator',
    bureau: 'Intake Desk',
    bureauId: null,
    region: null,
    isAdmin: false,
    initials: 'NJ',
    avatarColor: '#7c3aed', // Violet / Purple
    avatarBgLight: '#faf5ff',
    tagColor: 'purple',
    description: 'Multi-channel grievance entry, OCR intake, and institution match review resolution.',
  },
];

/**
 * Returns the demo password from environment configuration or default.
 */
export function getDemoPassword(): string {
  return env.VITE_DEMO_PASSWORD ?? 'change-me-demo-pass';
}

/**
 * Looks up persona by email address.
 */
export function findPersonaByEmail(email: string): Persona | undefined {
  const normalized = email.trim().toLowerCase();
  return PERSONAS.find((p) => p.email.toLowerCase() === normalized);
}

/**
 * Looks up persona by ID.
 */
export function findPersonaById(id: string): Persona | undefined {
  return PERSONAS.find((p) => p.id === id);
}
