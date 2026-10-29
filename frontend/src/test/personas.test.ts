import { describe, it, expect } from 'vitest';
import {
  PERSONAS,
  findPersonaByEmail,
  findPersonaById,
  getDemoPassword,
} from '../features/auth/personas';

describe('Demo Personas (#11)', () => {
  it('defines exactly the 5 official AICTE personas with correct attributes matching seed data', () => {
    expect(PERSONAS).toHaveLength(5);

    const ids = PERSONAS.map((p) => p.id);
    expect(ids).toEqual(['senior_mgmt', 'pgrc_head', 'rb_head', 'ro_nw', 'intake']);

    const senior = findPersonaById('senior_mgmt')!;
    expect(senior.email).toBe('senior@aicte.example');
    expect(senior.name).toBe('Dr. Meera Raghavan');
    expect(senior.title).toBe('Senior Officer');
    expect(senior.bureau).toBe('AICTE HQ');
    expect(senior.role).toBe('senior_mgmt');
    expect(senior.isAdmin).toBe(true);
    expect(senior.initials).toBe('MR');
    expect(senior.avatarColor).toBe('#1e3a8a');

    const pgrc = findPersonaById('pgrc_head')!;
    expect(pgrc.email).toBe('pgrc.head@aicte.example');
    expect(pgrc.name).toBe('Anil Deshmukh');
    expect(pgrc.title).toBe('PGRC Head');
    expect(pgrc.role).toBe('bureau_head');
    expect(pgrc.bureauId).toBe(2);
    expect(pgrc.isAdmin).toBe(false);
    expect(pgrc.initials).toBe('AD');

    const rb = findPersonaById('rb_head')!;
    expect(rb.email).toBe('rb.head@aicte.example');
    expect(rb.name).toBe('Kavita Rao');
    expect(rb.title).toBe('RB Head');
    expect(rb.role).toBe('bureau_head');
    expect(rb.bureauId).toBe(1);
    expect(rb.initials).toBe('KR');

    const ro = findPersonaById('ro_nw')!;
    expect(ro.email).toBe('ro.nw@aicte.example');
    expect(ro.name).toBe('Rakesh Tiwari');
    expect(ro.title).toBe('North-Western RO Officer');
    expect(ro.role).toBe('ro_officer');
    expect(ro.region).toBe('north_western');
    expect(ro.bureauId).toBe(9);
    expect(ro.initials).toBe('RT');

    const intake = findPersonaById('intake')!;
    expect(intake.email).toBe('intake@aicte.example');
    expect(intake.name).toBe('Neha Joshi');
    expect(intake.title).toBe('Intake Operator');
    expect(intake.bureau).toBe('Intake Desk');
    expect(intake.role).toBe('intake_operator');
    expect(intake.initials).toBe('NJ');
  });

  it('looks up personas by email case-insensitively', () => {
    expect(findPersonaByEmail('SENIOR@aicte.example')?.id).toBe('senior_mgmt');
    expect(findPersonaByEmail('pgrc.head@aicte.example')?.id).toBe('pgrc_head');
    expect(findPersonaByEmail('nonexistent@example.com')).toBeUndefined();
  });

  it('provides the demo password', () => {
    const pass = getDemoPassword();
    expect(typeof pass).toBe('string');
    expect(pass.length).toBeGreaterThan(0);
  });
});
