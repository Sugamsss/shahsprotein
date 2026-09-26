import React, { useRef, useState } from 'react';
import { AtSign, ChevronRight, Pencil, User } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { adminCopy } from '../../data/adminCopy';
import type { ThemeMode } from '../../types/theme';
import { changePassword, getUsers } from '../api';
import { signOut, useAdminMe } from '../auth';
import { firstName, formatDay } from '../format';
import { Field, LoadError, Segmented, SheetForm, Skeleton } from '../parts';
import { useToast } from '../toast';
import { useRpc } from '../useRpc';
import { emailToUsername } from '../username';

const copy = adminCopy.settings;
const THEMES = (['light', 'dark', 'system'] as const).map((value) => ({ value, label: copy.themes[value] }));

// Settings (spec 2.13): who can open the admin, appearance, and you.

const PasswordSheet: React.FC<{ onClose: () => void; onDone: () => void }> = ({ onClose, onDone }) => {
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [problem, setProblem] = useState<{ field: 'password' | 'again'; text: string } | null>(null);
  const firstRef = useRef<HTMLInputElement>(null);

  const save = async () => {
    if (password.length < 10) return setProblem({ field: 'password', text: copy.tooShort });
    if (again !== password) return setProblem({ field: 'again', text: copy.mismatch });
    setProblem(null);
    await changePassword(password);
    onDone();
  };
  const errorFor = (field: 'password' | 'again') => (problem?.field === field ? problem.text : null);

  return (
    <SheetForm title={copy.changePassword} submitLabel={copy.changePassword} busyLabel={copy.changing} onClose={onClose} onSubmit={save} initialFocus={firstRef}>
      <Field label={copy.newPassword} hint={copy.tooShort} error={errorFor('password')}>
        <input ref={firstRef} className="adm-input" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} />
      </Field>
      <Field label={copy.again} error={errorFor('again')}>
        <input className="adm-input" type="password" autoComplete="new-password" value={again} onChange={(event) => setAgain(event.target.value)} />
      </Field>
    </SheetForm>
  );
};

const SettingsPage: React.FC = () => {
  const me = useAdminMe();
  const { mode, setMode } = useTheme();
  const toast = useToast();
  const users = useRpc(getUsers, []);
  const [sheet, setSheet] = useState(false);

  let access: React.ReactNode;
  if (users.error && !users.data) access = <LoadError onRetry={() => void users.reload()} />;
  else if (!users.data) access = <Skeleton cards={1} />;
  else {
    access = (
      <section className="adm-card adm-settings" aria-labelledby="adm-access">
        <h2 id="adm-access">{copy.access}</h2>
        <ul className="adm-list">
          {users.data.map((user) => (
            <li key={user.email} className="adm-settings__row">
              <User size={22} strokeWidth={1.75} aria-hidden="true" />
              <span className="adm-list__main">
                <span className="adm-list__title">
                  {firstName(user.display_name) || emailToUsername(user.email)}
                  {user.is_me && <span className="adm-pill">{copy.you}</span>}
                </span>
                <span className="adm-list__sub">{copy.since(emailToUsername(user.email), formatDay(user.created_at))}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="adm-settings__hint">{copy.accessHint}</p>
      </section>
    );
  }

  return (
    <div className="adm-page adm-page--list">
      <h1 className="adm-title">{copy.title}</h1>
      {access}
      <section className="adm-card adm-settings" aria-labelledby="adm-appearance">
        <h2 id="adm-appearance">{copy.appearance}</h2>
        <Segmented<ThemeMode> label={copy.appearance} options={THEMES} value={mode} onChange={setMode} />
      </section>
      <section className="adm-card adm-settings" aria-labelledby="adm-you">
        <h2 id="adm-you">{copy.youTitle}</h2>
        <div className="adm-list">
          <div className="adm-settings__row">
            <AtSign size={22} strokeWidth={1.75} aria-hidden="true" />
            <span className="adm-list__main">
              <span className="adm-list__sub">{copy.signedInAs}</span>
              <span className="adm-settings__email">{emailToUsername(me.email)}</span>
            </span>
          </div>
          <button type="button" className="adm-settings__row" onClick={() => setSheet(true)}>
            <Pencil size={22} strokeWidth={1.75} aria-hidden="true" />
            <span className="adm-list__title">{copy.changePassword}</span>
            <ChevronRight className="adm-list__end" size={20} aria-hidden="true" />
          </button>
        </div>
        <button type="button" className="adm-btn adm-btn--quiet adm-btn--block" onClick={() => void signOut()}>
          {adminCopy.signOut}
        </button>
      </section>
      {sheet && (
        <PasswordSheet
          onClose={() => setSheet(false)}
          onDone={() => { setSheet(false); toast.show({ text: copy.changed }); }}
        />
      )}
    </div>
  );
};

export default SettingsPage;
