// Coupon end dates are whole days in India time, whatever the viewer's timezone.
const IST = 'Asia/Kolkata';

const dayParts = (iso: string) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: IST,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return { day: get('day'), month: get('month'), year: get('year') };
};

/** "31 Oct 2026", in IST. */
export const formatCouponDate = (iso: string): string => {
  const { day, month, year } = dayParts(iso);
  return `${day} ${month} ${year}`;
};

/** The IST calendar day as a date input value, "2026-10-31". */
export const toDateInputValue = (iso: string): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: IST }).format(new Date(iso));

/** Today in IST as a date input value, for the input's `min`. */
export const todayDateInputValue = (): string => toDateInputValue(new Date().toISOString());

/** The end of that day in IST: "2026-10-31" -> "2026-10-31T23:59:59+05:30". */
export const endOfDayIst = (dateValue: string): string => `${dateValue}T23:59:59+05:30`;

export const hasEnded = (expiresAt: string | null, now = Date.now()): boolean =>
  expiresAt !== null && new Date(expiresAt).getTime() <= now;
