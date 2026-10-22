import type { DeliveryAddress } from '../types/delivery';

const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g;
export const cleanAddressPart = (value: string, max: number): string =>
  Array.from(value.replace(CONTROL, ' ').replace(/\s+/g, ' ').trim()).slice(0, max).join('');

export const cleanPhone = (value: string): string => {
  let digits = value.replace(/\D/g, '');
  if (digits.startsWith('0091')) digits = digits.slice(2);
  if (digits.startsWith('91') && digits.length === 12) return digits;
  if (digits.startsWith('0') && digits.length === 11) digits = digits.slice(1);
  return digits.length === 10 ? `91${digits}` : digits;
};

export const cleanDeliveryAddress = (address: DeliveryAddress): DeliveryAddress => ({
  premises: cleanAddressPart(address.premises, 160),
  area: cleanAddressPart(address.area, 160),
  city: cleanAddressPart(address.city, 80),
  state: cleanAddressPart(address.state, 80),
  pincode: address.pincode.replace(/\D/g, '').slice(0, 6),
  landmark: cleanAddressPart(address.landmark ?? '', 160),
});

export const isValidDeliveryAddress = (address: DeliveryAddress): boolean => {
  const a = cleanDeliveryAddress(address);
  return Boolean(a.premises && a.area && a.city && a.state && /^[1-9]\d{5}$/.test(a.pincode));
};

export const formatDeliveryAddress = (address: DeliveryAddress): string => {
  const a = cleanDeliveryAddress(address);
  return [a.premises, a.area, a.landmark, a.city, a.state, a.pincode].filter(Boolean).join(', ');
};
