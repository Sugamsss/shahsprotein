import { describe, expect, it } from 'vitest';
import { namesOneOrder, searchFor } from './model';

// "Find an order": a pasted WhatsApp message searches just its code.

describe('searchFor', () => {
  it('pulls the code out of a pasted order message', () => {
    const message = "Hi! I'm Anjali, and I'd like to place an order:\n\n• Muesli 250 g × 2\n\nPincode: 415001\nOrder code: sn-7kq4m\n\nCould you send me the total?";
    expect(searchFor(message)).toBe('SN-7KQ4M');
  });

  it('keeps a clash suffix', () => {
    expect(searchFor('about SN-7KQ4M-2 please')).toBe('SN-7KQ4M-2');
  });

  it('leaves names, phone digits and partial codes as typed', () => {
    expect(searchFor('Anjali')).toBe('Anjali');
    expect(searchFor('98000')).toBe('98000');
    expect(searchFor('7KQ4')).toBe('7KQ4');
    // Look-alike letters (O, I, L, U) never make a code.
    expect(searchFor('SN-7KQ4O')).toBe('SN-7KQ4O');
  });
});

describe('namesOneOrder', () => {
  it('is true for a whole code or a whole phone number', () => {
    expect(namesOneOrder('SN-7KQ4M')).toBe(true);
    expect(namesOneOrder('+91 98000 00001')).toBe(true);
  });

  it('is false for a name or a partial code, so typing never jumps away', () => {
    expect(namesOneOrder('Anjali')).toBe(false);
    expect(namesOneOrder('SN-7KQ')).toBe(false);
  });
});
