import { describe, expect, it } from 'vitest';
import { deliveryFee, deliveryNudge, paidPackMetrics, sliceADeliveryRule } from './orderOffer';
const line = (size: string, quantity = 1) => ({ productId: 'muesli', size, quantity });

describe('Slice A delivery offer math', () => {
  it('uses exact weight and pack thresholds', () => {
    const guest = sliceADeliveryRule.guest;
    for (const grams of [0, 249, 250]) expect(deliveryFee({ grams, packs: grams ? 1 : 0 }, guest).fee).toBe(grams ? 50 : 0);
    for (const grams of [251, 499]) expect(deliveryFee({ grams, packs: 1 }, guest).fee).toBe(70);
    expect(deliveryFee({ grams: 500, packs: 1 }, guest).fee).toBe(0);
    expect(deliveryFee({ grams: 501, packs: 2 }, guest).fee).toBe(0);
    expect(deliveryFee({ grams: 500, packs: 1 }, sliceADeliveryRule.second).fee).toBe(70);
    expect(deliveryFee({ grams: 500, packs: 2 }, sliceADeliveryRule.second).fee).toBe(0);
  });
  it('counts repeated same-product packs and excludes out lines', () => {
    expect(paidPackMetrics([line('250 g', 2)])).toEqual({ grams: 500, packs: 2 });
    expect(paidPackMetrics([line('250 g'), line('500 g')])).toEqual({ grams: 750, packs: 2 });
    expect(paidPackMetrics([line('250 g')], () => true)).toEqual({ grams: 0, packs: 0 });
  });
  it('nudges only the applicable unmet threshold', () => {
    expect(deliveryNudge({ grams: 250, packs: 1 }, sliceADeliveryRule.guest)).toBe('Add 250 g more and delivery’s on us.');
    expect(deliveryNudge({ grams: 500, packs: 1 }, sliceADeliveryRule.second)).toBe('Add one more pack and delivery’s on us.');
    expect(deliveryNudge({ grams: 500, packs: 2 }, sliceADeliveryRule.second)).toBeNull();
  });
});
