import React from 'react';
import { adminCopy as copy } from '../../data/adminCopy';
import { ComingNext } from './ComingNext';

const OrdersPage: React.FC = () => <ComingNext title={copy.pages.orders} />;

export default OrdersPage;
