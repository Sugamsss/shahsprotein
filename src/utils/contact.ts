import { siteConfig } from '../data/siteConfig';
import { AnalyticsService } from '../services/analyticsService';

const { order, care } = siteConfig.contact;

/** A wa.me link, with the message URL-encoded so names and punctuation survive. */
export const whatsappUrl = (number: string, message?: string): string =>
  `https://wa.me/${number}${message ? `?text=${encodeURIComponent(message)}` : ''}`;

export const telUrl = (number: string): string => `tel:+${number}`;

/** The order chat, prefilled for a product or with the general order message. */
export const orderUrl = (productName?: string): string =>
  whatsappUrl(
    order.number,
    productName ? siteConfig.orderMessages.product(productName) : siteConfig.orderMessages.general,
  );

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
