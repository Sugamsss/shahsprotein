import React from 'react';
import { adminCopy as copy } from '../../data/adminCopy';
import { ComingNext } from './ComingNext';

const EmailListPage: React.FC = () => <ComingNext title={copy.pages.emailList} />;

export default EmailListPage;
