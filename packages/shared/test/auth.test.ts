import { describe, expect, it } from 'vitest';
import { LoginSchema, RegisterSchema, homeFor } from '../src/auth';
import { toBrief } from '../src/catalogue';
import { loadAllScenarios } from '../src/scenario/load';
import { join } from 'node:path';

describe('RegisterSchema', () => {
  it('normalises email and defaults role to LEARNER', () => {
    const r = RegisterSchema.parse({
      name: 'Ali Raza',
      email: '  Ali@SEECS.edu.pk ',
      password: 'longenough1',
    });
    expect(r.email).toBe('ali@seecs.edu.pk');
    expect(r.role).toBe('LEARNER');
  });

  it('rejects short passwords with a helpful message', () => {
    const r = RegisterSchema.safeParse({ name: 'Ali', email: 'a@b.co', password: 'short' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toMatch(/at least 10/);
  });

  it('never lets a user sign up as ADMIN', () => {
    const r = RegisterSchema.safeParse({
      name: 'Eve',
      email: 'e@b.co',
      password: 'longenough1',
      role: 'ADMIN',
    });
    expect(r.success).toBe(false);
  });
});

describe('LoginSchema / homeFor', () => {
  it('requires both fields', () => {
    expect(LoginSchema.safeParse({ email: 'a@b.co' }).success).toBe(false);
  });
  it('routes each role to its home', () => {
    expect(homeFor('LEARNER')).toBe('/dashboard');
    expect(homeFor('INSTRUCTOR')).toBe('/instructor');
    expect(homeFor('ADMIN')).toBe('/admin');
  });
});

describe('toBrief', () => {
  it('exposes no hidden scenario data', () => {
    const s = loadAllScenarios(join(__dirname, '..', '..', '..', 'scenarios')).find((r) => r.ok)!.scenario!;
    const json = JSON.stringify(toBrief(s));
    for (const secret of [
      'faults',
      'hidden-tests',
      'explainPass',
      'debriefRules',
      'PAYMENT_TIMEOUT',
      'pattern',
    ]) {
      expect(json).not.toContain(secret);
    }
    expect(toBrief(s).rubric.reduce((a, r) => a + r.weight, 0)).toBe(100);
  });
});
