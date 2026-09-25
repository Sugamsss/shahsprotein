import { siteConfig } from '../data/siteConfig';
import { AnalyticsService } from '../services/analyticsService';

const { order, care } = siteConfig.contact;

/** A wa.me link, with the message URL-encoded so names and punctuation survive. */
export const whatsappUrl = (number: string, message?: string): string =>
  `https://wa.me/${number}${message ? `?text=${encodeURIComponent(message)}` : ''}`;

export const telUrl = (number: string): string => `tel:+${number}`;

/** The order chat with the general order message, for links that skip the "Your order" popup. */
export const orderUrl = (): string => whatsappUrl(order.number, siteConfig.orderMessages.general);

/** The order chat with nothing prefilled, for questions rather than orders. */
export const askUrl = (): string => whatsappUrl(order.number);

export const careCallUrl = (): string => telUrl(care.number);
export const careWhatsappUrl = (): string => whatsappUrl(care.number);

/**
 * Orders happen inside WhatsApp, so a click is the only signal the site gets.
 * `source` says which button it was, e.g. "hero", "product:muesli", "faq".
 */
export const trackOrderClick = (source: string): void => {
  AnalyticsService.trackSiteEvent('whatsapp_order_click', source);
};

/** Places that can open the "Your order" popup. */
export type OrderPopupOpener = 'header' | 'hero' | 'banner' | 'footer' | 'product' | 'product-details';

/**
 * The "Your order" popup's Send, recorded as an order click. Never pass the
 * name, pincode or coupon. `openedFrom` is the place that opened the popup
 * (e.g. "hero"), so the admin can still see which buttons lead to orders.
 * The places must match the `site_events` source pattern (migrations 20260925000001 and 000003).
 */
export const trackOrderSend = (openedFrom?: OrderPopupOpener): void => {
  trackOrderClick(openedFrom ? `order-popup:${openedFrom}` : 'order-popup');
};

/** The empty popup's "Message us on WhatsApp", a direct order chat. Kept apart from Send. */
export const trackOrderChat = (): void => {
  trackOrderClick('order-popup:chat');
};
