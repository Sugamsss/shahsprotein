// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRpc } from './useRpc';

describe('useRpc ensureFresh', () => {
  let root: Root;
  let container: HTMLDivElement;
  let rpcResult: ReturnType<typeof useRpc<{ count: number }>>;
  let loadCalls: number;

  const loadFn = async () => {
    loadCalls++;
    return { count: loadCalls };
  };

  function TestComponent() {
    rpcResult = useRpc(loadFn, []);
    return null;
  }

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    loadCalls = 0;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it('loads on mount, skips ensureFresh when within maxAgeMs, and reloads when aged', async () => {
    const dateSpy = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);

    await act(async () => {
      root.render(<TestComponent />);
    });

    expect(loadCalls).toBe(1);
    expect(rpcResult.data).toEqual({ count: 1 });

    // Call ensureFresh 2 seconds later (within 15s maxAgeMs) -> should skip
    dateSpy.mockReturnValue(1_002_000);
    await act(async () => {
      await rpcResult.ensureFresh(15_000);
    });
    expect(loadCalls).toBe(1);

    // Call ensureFresh 20 seconds later (exceeds 15s maxAgeMs) -> should fetch fresh
    dateSpy.mockReturnValue(1_025_000);
    await act(async () => {
      await rpcResult.ensureFresh(15_000);
    });
    expect(loadCalls).toBe(2);
    expect(rpcResult.data).toEqual({ count: 2 });

    // Calling reload() directly always reloads regardless of maxAgeMs
    await act(async () => {
      await rpcResult.reload();
    });
    expect(loadCalls).toBe(3);
    expect(rpcResult.data).toEqual({ count: 3 });
  });
});
