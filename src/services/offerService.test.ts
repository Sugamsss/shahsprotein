import { describe, expect, it } from 'vitest';
import { parseWebsiteOffer } from './offerService';
const packs = [
  ['muesli', '250 g', 250, 399, 359], ['muesli', '500 g', 500, 699, 629],
  ['raggi-jaggi', '250 g', 250, 249, 224], ['raggi-jaggi', '500 g', 500, 479, 431], ['bites', '250 g', 250, 319, 287],
].map(([product_id, size, grams, mrp, price]) => ({ product_id, size, grams, mrp, price }));
const ready = { schema_version: 1, status: 'ready', version: 'v1', server_time: '2026-11-09T00:00:00Z', expires_at: '2027-01-01T00:00:00Z', currency: 'INR', offer: { label: 'Guest', kind: 'guest' }, packs, delivery: { min_grams: 500, min_packs: null, up_to_250: 50, above_250: 70, cap: 70 } };
describe('website offer envelope', () => {
  it('accepts only complete consistent five-pack offers', () => expect(parseWebsiteOffer(ready)?.packs).toHaveLength(5));
  it('rejects missing packs, invalid prices and wrong schema', () => {
    expect(parseWebsiteOffer({ ...ready, packs: packs.slice(1) })).toBeNull();
    expect(parseWebsiteOffer({ ...ready, schema_version: 2 })).toBeNull();
    expect(parseWebsiteOffer({ ...ready, packs: packs.map((p, i) => i ? p : { ...p, price: 0 }) })).toBeNull();
    expect(parseWebsiteOffer({ ...ready, packs: packs.map((p, i) => i ? p : { ...p, price: Number(p.mrp) + 1 }) })).toBeNull();
  });
});
