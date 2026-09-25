// Admins sign in with a plain username ("sunit"). Supabase Auth only knows
// emails, so each admin's auth email is `<username>@admin.shahsnutrition.food`.
// That subdomain has no mail servers (no MX or A record), so nothing is ever
// delivered there, and there's no password-reset email: the site owner sets
// passwords with `scripts/set-admin-password.mjs`.

export const ADMIN_EMAIL_DOMAIN = 'admin.shahsnutrition.food';

/** "Sunit " → "sunit@admin.shahsnutrition.food". A full email is kept as typed (trimmed). */
export const usernameToEmail = (typed: string): string => {
  const value = typed.trim();
  if (!value || value.includes('@')) return value;
  return `${value.toLowerCase()}@${ADMIN_EMAIL_DOMAIN}`;
};

/** "sunit@admin.shahsnutrition.food" → "sunit". Any other email is shown as it is. */
export const emailToUsername = (email: string): string => {
  const suffix = `@${ADMIN_EMAIL_DOMAIN}`;
  return email.toLowerCase().endsWith(suffix) ? email.slice(0, -suffix.length) : email;
};
