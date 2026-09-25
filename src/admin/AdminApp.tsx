import React from 'react';

// The admin's lazy entry. A placeholder until the new admin is built (see
// temp/admin-rebuild). It's its own chunk, so the landing page never downloads
// it. Admin-only copy lives here for now. It reuses the 404 page's classes.
const AdminApp: React.FC = () => (
  <main className="not-found">
    <div className="not-found__card glass-card">
      <h1 className="not-found__title">The new admin is on its way.</h1>
    </div>
  </main>
);

export default AdminApp;
