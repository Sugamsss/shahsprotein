#!/usr/bin/env node
// Sets (or resets) an admin's password. There's no reset email: this script is
// the way to give someone a new password.
//
//   node scripts/set-admin-password.mjs sunit
//
// It asks for the new password twice (typing is hidden), needs at least 10
// characters, and sets it through the Supabase Auth admin API. The service key
// is fetched at run time from the logged-in Supabase CLI (`supabase login`), and
// neither the key nor the password is ever printed, logged or saved.
//
// For testing against a local stack: add `--local <folder with supabase/>`.

import { execFileSync } from 'node:child_process';
import process from 'node:process';

const PROJECT_REF = 'dzgmobndvryletfpbriu';
const ADMIN_EMAIL_DOMAIN = 'admin.shahsnutrition.food'; // same as src/admin/username.ts
const MIN_LENGTH = 10;

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

const args = process.argv.slice(2);
const localAt = args.indexOf('--local');
const localDir = localAt >= 0 ? args[localAt + 1] : null;
const rest = localAt >= 0 ? args.filter((_, i) => i !== localAt && i !== localAt + 1) : args;
const username = rest[0]?.trim().toLowerCase();

if (!username || !/^[a-z0-9._-]{2,40}$/.test(username)) {
  fail('Usage: node scripts/set-admin-password.mjs <username>   (e.g. sunit)');
}
if (localAt >= 0 && !localDir) fail('--local needs the folder that holds supabase/.');

const email = `${username}@${ADMIN_EMAIL_DOMAIN}`;

/** The API address and service key, straight from the Supabase CLI. Never printed. */
const connection = () => {
  try {
    if (localDir) {
      const status = JSON.parse(execFileSync('supabase', ['status', '-o', 'json'], { cwd: localDir, stdio: ['ignore', 'pipe', 'ignore'] }));
      return { url: status.API_URL, key: status.SERVICE_ROLE_KEY ?? status.SECRET_KEY };
    }
    const keys = JSON.parse(execFileSync('supabase', ['projects', 'api-keys', '--project-ref', PROJECT_REF, '-o', 'json'], { stdio: ['ignore', 'pipe', 'ignore'] }));
    const service = keys.find((k) => k.name === 'service_role');
    return { url: `https://${PROJECT_REF}.supabase.co`, key: service?.api_key };
  } catch {
    return { url: null, key: null };
  }
};

/** Reads one line without showing what's typed. Piped input (tests) is read as plain lines. */
const readHidden = (prompt) => new Promise((resolve) => {
  const stdin = process.stdin;
  process.stdout.write(prompt);
  if (!stdin.isTTY) {
    let buffer = '';
    const onData = (chunk) => {
      buffer += chunk;
      const end = buffer.indexOf('\n');
      if (end >= 0) {
        stdin.off('data', onData);
        stdin.pause();
        stdin.unshift(buffer.slice(end + 1));
        process.stdout.write('\n');
        resolve(buffer.slice(0, end).replace(/\r$/, ''));
      }
    };
    stdin.setEncoding('utf8');
    stdin.on('data', onData);
    stdin.resume();
    return;
  }
  let value = '';
  stdin.setRawMode(true);
  stdin.setEncoding('utf8');
  stdin.resume();
  const onKey = (key) => {
    for (const ch of key) {
      if (ch === '\u0003') { stdin.setRawMode(false); process.stdout.write('\n'); process.exit(130); }
      if (ch === '\r' || ch === '\n') {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.off('data', onKey);
        process.stdout.write('\n');
        resolve(value);
        return;
      }
      if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1);
      else if (ch >= ' ') value += ch;
    }
  };
  stdin.on('data', onKey);
});

const { url, key } = connection();
if (!url || !key) {
  fail(localDir
    ? 'Could not read the local stack. Is it running (`supabase start`)?'
    : 'Could not get the project key. Run `supabase login` first, with an account that can open the project.');
}

const api = (path, init = {}) => fetch(`${url}/auth/v1${path}`, {
  ...init,
  headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
});

// Few users, so one page is enough; match the email exactly.
const list = await api('/admin/users?per_page=1000');
if (!list.ok) fail(`Could not list users (HTTP ${list.status}).`);
const { users = [] } = await list.json();
const user = users.find((u) => (u.email ?? '').toLowerCase() === email);
if (!user) fail(`No admin account for "${username}" (${email}). Add the user first; see supabase/README.md.`);

console.log(`Setting a new password for ${username}.`);
const first = await readHidden('New password: ');
if (first.length < MIN_LENGTH) fail(`Too short. Use at least ${MIN_LENGTH} characters.`);
const second = await readHidden('Type it again: ');
if (first !== second) fail("The two don't match. Nothing was changed.");

const update = await api(`/admin/users/${user.id}`, { method: 'PUT', body: JSON.stringify({ password: first }) });
if (!update.ok) fail(`The password was not changed (HTTP ${update.status}).`);

console.log(`Done. ${username} can sign in at /admin with the username "${username}" and the new password.`);
process.exit(0);
