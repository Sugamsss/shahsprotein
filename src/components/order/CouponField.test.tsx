// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OrderProvider, useOrder, type OrderContextType } from '../../context/OrderContext';
import type { CouponCheck } from '../../types/order';
import { CouponField } from './CouponField';

const { checkCoupon } = vi.hoisted(() => ({ checkCoupon: vi.fn() }));
vi.mock('../../services/couponService', async (original) => ({
  ...await original<typeof import('../../services/couponService')>(), checkCoupon,
}));
vi.mock('../../services/stockService', () => ({
  useStock: () => ({ isOut: () => false }), firstInStockSize: () => '250 g',
}));

describe('coupon acceptance lifecycle', () => {
  let root: Root;
  let container: HTMLDivElement;
  let order: OrderContextType;
  let frames: Map<number, FrameRequestCallback>;
  let nextFrame: number;
  let reduced: boolean;
  let motionListeners: Set<(event: MediaQueryListEvent) => void>;

  function Capture() { order = useOrder(); return <CouponField />; }
  const change = (fn: (value: OrderContextType) => void) => act(() => fn(order));
  const accept = { status: 'valid', code: 'EXAMPLE10', description: 'Example offer' } as const;
  const pendingCheck = () => {
    let resolve!: (result: CouponCheck) => void;
    checkCoupon.mockReturnValueOnce(new Promise<CouponCheck>((done) => { resolve = done; }));
    return (result: CouponCheck = accept) => act(async () => { resolve(result); });
  };
  const apply = () => {
    change((o) => o.setCouponInput('EXAMPLE10'));
    change((o) => o.applyCoupon());
  };
  const paint = (now = performance.now()) => act(() => {
    const queued = [...frames]; frames.clear(); queued.forEach(([, callback]) => callback(now));
  });

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    checkCoupon.mockReset(); frames = new Map(); nextFrame = 0; reduced = false; motionListeners = new Set();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.set(++nextFrame, callback); return nextFrame;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
    vi.stubGlobal('matchMedia', () => ({
      matches: reduced,
      addEventListener: (_type: string, fn: (event: MediaQueryListEvent) => void) => motionListeners.add(fn),
      removeEventListener: (_type: string, fn: (event: MediaQueryListEvent) => void) => motionListeners.delete(fn),
    }));
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      clearRect() {}, save() {}, restore() {}, scale() {}, translate() {}, rotate() {},
      beginPath() {}, roundRect() {}, fill() {}, arc() {},
    } as unknown as CanvasRenderingContext2D);
    container = document.createElement('div'); document.body.append(container);
    root = createRoot(container);
    act(() => root.render(<React.StrictMode><OrderProvider><Capture /></OrderProvider></React.StrictMode>));
    change((o) => o.setCouponOpen(true));
  });
  afterEach(() => {
    act(() => root.unmount()); container.remove();
    vi.restoreAllMocks(); vi.unstubAllGlobals();
    document.querySelectorAll('.coupon-confetti').forEach((canvas) => canvas.remove());
  });

  it.each(['remove', 'edit'] as const)('ignores an earlier reply after %s and retyping the same code', async (kind) => {
    const reply = pendingCheck(); apply();
    change((o) => kind === 'remove' ? o.removeCoupon() : o.setCouponInput('OTHER10'));
    change((o) => o.setCouponInput('EXAMPLE10'));
    await reply();
    expect(order.coupon.status).toBe('idle');
    expect(order.messageCoupon).toEqual({ code: 'EXAMPLE10', checked: false });
    expect(frames.size).toBe(0);
  });

  it('does not let a sent order check overwrite a new order using the same code', async () => {
    const oldReply = pendingCheck(); apply();
    change((o) => o.markSent(o.currentOrder(), 'https://example.invalid/order'));
    change((o) => o.startNewOrder());
    const newReply = pendingCheck(); apply();
    await oldReply(); expect(order.coupon.status).toBe('checking');
    await newReply({ status: 'invalid', code: 'EXAMPLE10' });
    expect(order.coupon.status).toBe('invalid'); expect(frames.size).toBe(0);
  });

  it('cancels a scheduled burst when the field unmounts before painting', async () => {
    const reply = pendingCheck(); apply(); await reply();
    expect(frames.size).toBe(1);
    act(() => root.render(<div />)); paint();
    expect(document.querySelector('.coupon-confetti')).toBeNull();
    expect(frames.size).toBe(0);
  });

  it('celebrates fresh acceptance, survives unrelated edits, and cleans up at completion', async () => {
    const reply = pendingCheck(); apply(); await reply();
    change((o) => o.setName('Example'));
    paint(); expect(document.querySelectorAll('.coupon-confetti')).toHaveLength(1);
    paint(); paint(performance.now() + 2000);
    expect(document.querySelector('.coupon-confetti')).toBeNull(); expect(frames.size).toBe(0);
  });

  it('cancels the running burst on unmount and does not replay a saved acceptance on reopen', async () => {
    const reply = pendingCheck(); apply(); await reply(); paint();
    act(() => root.render(<React.StrictMode><OrderProvider><div /></OrderProvider></React.StrictMode>));
    expect(document.querySelector('.coupon-confetti')).toBeNull(); expect(frames.size).toBe(0);
    act(() => root.render(<React.StrictMode><OrderProvider><Capture /></OrderProvider></React.StrictMode>));
    expect(order.coupon.status).toBe('valid'); expect(frames.size).toBe(0);
  });

  it('celebrates removing and freshly accepting the same code again', async () => {
    const first = pendingCheck(); apply(); await first(); paint();
    change((o) => o.removeCoupon());
    const second = pendingCheck(); apply(); await second(); paint();
    expect(document.querySelectorAll('.coupon-confetti')).toHaveLength(1);
  });

  it.each(['invalid', 'unavailable', 'reduced'] as const)('does not render confetti for %s', async (reason) => {
    reduced = reason === 'reduced';
    const reply = pendingCheck(); apply();
    await reply(reason === 'reduced' ? accept : { status: reason, code: 'EXAMPLE10' });
    paint(); expect(document.querySelector('.coupon-confetti')).toBeNull(); expect(frames.size).toBe(0);
  });

  it('stops a running burst immediately when reduced motion is enabled', async () => {
    const reply = pendingCheck(); apply(); await reply(); paint();
    expect(document.querySelector('.coupon-confetti')).not.toBeNull();
    reduced = true;
    motionListeners.forEach((listener) => listener({ matches: true } as MediaQueryListEvent));
    expect(document.querySelector('.coupon-confetti')).toBeNull(); expect(frames.size).toBe(0);
    expect(motionListeners.size).toBe(0);
  });
});
