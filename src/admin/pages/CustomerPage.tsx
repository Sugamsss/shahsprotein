import React from 'react';
import { usePathPart } from '../router';
import { adminCopy as copy } from '../../data/adminCopy';
import { ComingNext } from './ComingNext';

const CustomerPage: React.FC = () => <ComingNext title={`${copy.pages.customer} ${usePathPart(1)}`} />;

export default CustomerPage;
