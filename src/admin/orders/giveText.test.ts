import { describe, expect, it } from 'vitest';
import type { KitchenEffects, PriorityPouch } from '../types';
import { giveText, givenText } from './giveText';

const meera = { id: 'm', name: 'Meera Kulkarni', code: 'SN-K8M9N' };
const pouch = (order_id: string, name: string, product_id: string, size: string, count = 1, from: PriorityPouch['from'] = 'packing'): PriorityPouch =>
  ({ order_id, code: `SN-${order_id}`, name, from, product_id, size, grams_each: 500, count });
const tanvi = { name: 'Tanvi More', code: 'SN-Z8A2B' };
const farah = { name: 'Farah Shaikh', code: 'SN-W6X7Y' };

describe('giveText: the priority popup', () => {
  it('one pouch from one order: a single question, and who goes back', () => {
    const t = giveText(meera, [pouch('t', 'Tanvi More', 'raggi-jaggi', '500 g')], [tanvi]);
    expect(t).toEqual({
      title: 'Meera is priority',
      question: 'Give Meera Tanvi’s packed Raggi Jaggi 500 g?',
      items: [],
      after: 'Tanvi’s order goes back to Cooking.',
      confirm: 'Give it to Meera',
    });
  });

  it('several pouches from one order stay one sentence, counted', () => {
    const t = giveText(meera, [pouch('t', 'Tanvi More', 'raggi-jaggi', '500 g', 2), pouch('t', 'Tanvi More', 'muesli', '500 g')], [tanvi]);
    expect(t.question).toBe('Give Meera Tanvi’s packed Raggi Jaggi 500 g × 2 and Muesli 500 g?');
    expect(t.items).toEqual([]);
    expect(t.confirm).toBe('Give them to Meera');
  });

  it('pouches from several orders: a line each, and everyone who goes back', () => {
    const t = giveText(meera, [
      pouch('t', 'Tanvi More', 'raggi-jaggi', '500 g'),
      pouch('f', 'Farah Shaikh', 'bites', '250 g', 2, 'ready'),
      pouch('t', 'Tanvi More', 'muesli', '500 g'),
    ], [tanvi, farah]);
    expect(t.question).toBe('Give Meera these packed pouches?');
    expect(t.items).toEqual(['Tanvi’s Raggi Jaggi 500 g and Muesli 500 g', 'Farah’s Date Bites 250 g × 2']);
    expect(t.after).toBe('Tanvi’s and Farah’s orders go back to Cooking.');
    expect(t.confirm).toBe('Give them to Meera');
  });

  it('says nothing about Cooking when the giving order is still covered', () => {
    expect(giveText(meera, [pouch('t', 'Tanvi More', 'raggi-jaggi', '500 g')], []).after).toBe('');
  });

  it('falls back to the code when an order has no name', () => {
    const t = giveText({ name: null, code: 'SN-K8M9N' }, [pouch('t', null as unknown as string, 'raggi-jaggi', '500 g')], []);
    expect(t.title).toBe('SN-K8M9N is priority');
    expect(t.question).toBe('Give SN-K8M9N SN-t’s packed Raggi Jaggi 500 g?');
  });
});

describe('givenText: the toast after giving', () => {
  const effects = (orders: KitchenEffects['orders']) => ({ orders }) as KitchenEffects;
  it('says where the priority order went, then who went back', () => {
    expect(givenText(meera, effects([
      { id: 'm', code: 'SN-K8M9N', name: 'Meera Kulkarni', from: 'cooking', to: 'packing', grams: [], waiting: [] },
      { id: 't', code: 'SN-Z8A2B', name: 'Tanvi More', from: 'packing', to: 'cooking', grams: [], waiting: ['raggi-jaggi'] },
    ]))).toBe("Meera's order moved to Packing. Tanvi's order is back to Cooking.");
  });

  it('still short: says it gave the food', () => {
    expect(givenText(meera, effects([
      { id: 't', code: 'SN-Z8A2B', name: 'Tanvi More', from: 'ready', to: 'cooking', grams: [], waiting: [] },
    ]))).toBe("Gave Meera the packed food. Tanvi's order is back to Cooking.");
  });
});
