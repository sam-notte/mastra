import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveCdpWebSocketUrl } from '../resolve-cdp';

describe('resolveCdpWebSocketUrl', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it('returns ws:// URLs unchanged without fetching', async () => {
    const f = vi.fn();
    global.fetch = f as unknown as typeof fetch;
    await expect(resolveCdpWebSocketUrl('ws://host:9222/devtools/browser/abc')).resolves.toBe(
      'ws://host:9222/devtools/browser/abc',
    );
    expect(f).not.toHaveBeenCalled();
  });

  it('returns wss:// URLs unchanged (the Notte debug-endpoint shape)', async () => {
    const u = 'wss://us-prod.notte.cc/sessions/abc/debug?token=jwt';
    await expect(resolveCdpWebSocketUrl(u)).resolves.toBe(u);
  });

  it('resolves http(s):// via the /json/version endpoint', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ webSocketDebuggerUrl: 'ws://host:9222/devtools/browser/abc' }),
    }) as unknown as typeof fetch;
    await expect(resolveCdpWebSocketUrl('http://host:9222')).resolves.toBe('ws://host:9222/devtools/browser/abc');
    expect(global.fetch).toHaveBeenCalledWith('http://host:9222/json/version', expect.any(Object));
  });

  it('strips a trailing slash before appending /json/version', async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ webSocketDebuggerUrl: 'ws://h/x' }) });
    global.fetch = f as unknown as typeof fetch;
    await resolveCdpWebSocketUrl('https://host:9222/');
    expect(f).toHaveBeenCalledWith('https://host:9222/json/version', expect.any(Object));
  });

  it('throws when the version response is not ok', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 500, statusText: 'Server Error' }) as unknown as typeof fetch;
    await expect(resolveCdpWebSocketUrl('http://host:9222')).rejects.toThrow(/Failed to fetch CDP version info/);
  });

  it('throws when webSocketDebuggerUrl is missing from the response', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as unknown as typeof fetch;
    await expect(resolveCdpWebSocketUrl('http://host:9222')).rejects.toThrow(/No webSocketDebuggerUrl/);
  });

  it('returns non-http/ws strings unchanged', async () => {
    await expect(resolveCdpWebSocketUrl('localhost:9222')).resolves.toBe('localhost:9222');
  });
});
