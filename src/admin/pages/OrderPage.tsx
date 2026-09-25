import React from 'react';
import { usePathPart } from '../router';
import { ComingNext } from './ComingNext';

// On the laptop this opens as OrderPopup over the Orders board; on the phone it's a page.
const OrderPage: React.FC = () => <ComingNext title={usePathPart(1)} />;

export default OrderPage;
