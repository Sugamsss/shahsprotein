import React from 'react';
import { useAdminMe } from '../auth';
import { useOverview } from '../AdminLayout';
import { adminCopy as copy } from '../../data/adminCopy';
import { ComingNext } from './ComingNext';

// A stub, but it already greets whoever is signed in and reads the overview
// the layout loads for the Orders badge.
const HomePage: React.FC = () => {
  const me = useAdminMe();
  const { data } = useOverview();
  return (
    <ComingNext title={copy.home.greeting(me.display_name || me.email)}>
      {data && <p className="adm-muted">{copy.home.waiting(data.queue.to_confirm)}</p>}
    </ComingNext>
  );
};

export default HomePage;
