import { describe, expect, it } from 'vitest';
import { emailToUsername, usernameToEmail } from './username';

describe('usernameToEmail', () => {
  it('turns a username into its admin sign-in email, ignoring case and spaces', () => {
    expect(usernameToEmail(' Sunit ')).toBe('sunit@admin.shahsnutrition.food');
  });

  it('keeps a full email as typed, so old sign-ins still work', () => {
    expect(usernameToEmail(' Owner@Example.com ')).toBe('Owner@Example.com');
  });

  it('leaves an empty field empty', () => {
    expect(usernameToEmail('   ')).toBe('');
  });
});

describe('emailToUsername', () => {
  it('shows an admin email as its username', () => {
    expect(emailToUsername('pranjali@admin.shahsnutrition.food')).toBe('pranjali');
  });

  it('shows any other email unchanged', () => {
    expect(emailToUsername('owner@example.com')).toBe('owner@example.com');
  });
});
