import React from 'react';
import { adminCopy as copy } from '../../data/adminCopy';
import { ComingNext } from './ComingNext';

const NewOrderPage: React.FC = () => <ComingNext title={copy.pages.newOrder} />;

export default NewOrderPage;
