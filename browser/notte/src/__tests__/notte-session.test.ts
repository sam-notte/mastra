import { beforeEach, describe, expect, it, vi } from 'vitest';

// Only `sessionDebugInfo` is a runtime import in notte-session.ts; everything else is type-only.
const sessionDebugInfo = vi.fn();
vi.mock('notte-sdk', () => ({
  sessionDebugInfo: (...args: unknown[]) => sessionDebugInfo(...args),
}));

import { provisionNotteSession, safeStopNotteSession } from '../notte-session';

function fakeSession(over: Record<string, unknown> = {}) {
  return {
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    status: vi.fn().mockResolvedValue({}),
    getId: vi.fn().mockReturnValue('sess-1'),
    ...over,
  };
}

function fakeClient(session: ReturnType<typeof fakeSession>) {
  return {
    Session: vi.fn().mockReturnValue(session),
    getClient: vi.fn().mockReturnValue({}),
  };
}

beforeEach(() => {
  sessionDebugInfo.mockReset();
});

describe('provisionNotteSession', () => {
  it('starts the session and resolves ws.cdp from the debug endpoint', async () => {
    const session = fakeSession();
    const notte = fakeClient(session);
    sessionDebugInfo.mockResolvedValue({ data: { ws: { cdp: 'wss://x/cdp' } } });

    const r = await provisionNotteSession(notte as never, {});

    expect(session.start).toHaveBeenCalledOnce();
    expect(r.sessionId).toBe('sess-1');
    expect(r.cdpWsUrl).toBe('wss://x/cdp');
    expect(session.stop).not.toHaveBeenCalled();
  });

  it('throws and stops the session when no id is returned', async () => {
    const session = fakeSession({ getId: vi.fn().mockReturnValue(null) });
    const notte = fakeClient(session);

    await expect(provisionNotteSession(notte as never, {})).rejects.toThrow(/no session id/);
    expect(session.stop).toHaveBeenCalledOnce();
  });

  it('falls back to status().cdp_url when ws.cdp is absent', async () => {
    const session = fakeSession({ status: vi.fn().mockResolvedValue({ cdp_url: 'wss://fallback/cdp' }) });
    const notte = fakeClient(session);
    sessionDebugInfo.mockResolvedValue({ data: { ws: {} } });

    const r = await provisionNotteSession(notte as never, {});
    expect(r.cdpWsUrl).toBe('wss://fallback/cdp');
  });

  it('still resolves via status fallback when sessionDebugInfo throws', async () => {
    const session = fakeSession({ status: vi.fn().mockResolvedValue({ cdp_url: 'wss://fallback/cdp' }) });
    const notte = fakeClient(session);
    sessionDebugInfo.mockRejectedValue(new Error('debug endpoint down'));

    const r = await provisionNotteSession(notte as never, {});
    expect(r.cdpWsUrl).toBe('wss://fallback/cdp');
  });

  it('throws when neither ws.cdp nor status cdp_url is available', async () => {
    const session = fakeSession({ status: vi.fn().mockResolvedValue({}) });
    const notte = fakeClient(session);
    sessionDebugInfo.mockResolvedValue({ data: { ws: {} } });

    await expect(provisionNotteSession(notte as never, {})).rejects.toThrow(/Could not resolve a CDP websocket URL/);
  });
});

describe('safeStopNotteSession', () => {
  it('resolves even when stop() rejects', async () => {
    const session = fakeSession({ stop: vi.fn().mockRejectedValue(new Error('already stopped')) });
    await expect(safeStopNotteSession(session as never)).resolves.toBeUndefined();
  });
});
