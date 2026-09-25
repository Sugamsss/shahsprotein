import React from 'react';
import { adminCopy as copy } from '../../data/adminCopy';
import { signOut, useAdminMe } from '../auth';
import { ComingNext } from './ComingNext';

// Sign out lives here on the phone (More → Settings), so the stub keeps it.
const SettingsPage: React.FC = () => {
  const me = useAdminMe();
  return (
    <ComingNext title={copy.pages.settings}>
      <section className="adm-card adm-stack">
        <p className="adm-muted">{copy.header.signedInAs} {me.email}</p>
        <button type="button" className="adm-btn adm-btn--quiet adm-btn--block" onClick={() => void signOut()}>
          {copy.signOut}
        </button>
      </section>
    </ComingNext>
  );
};

export default SettingsPage;
