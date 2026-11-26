import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import * as http from '../src/http.js';
import { createConsoleSpies, restoreConsoleSpies } from './helpers/console.js';

const env = {
  MATOMO_URL: 'https://analytics.example.com',
  MATOMO_SITE_ID: '7',
  USER_AGENT_ALLOWLIST_REGEX: '.*'
};

describe('Worker fetch handler', () => {
  let originalFetch: typeof fetch;
  let waitUntil: ReturnType<typeof vi.fn<(promise: Promise<unknown>) => void>>;
  let consoleSpies: ReturnType<typeof createConsoleSpies>;

  beforeEach(() => {
    originalFetch = global.fetch;
    waitUntil = vi.fn<(promise: Promise<unknown>) => void>();
    consoleSpies = createConsoleSpies();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    restoreConsoleSpies(consoleSpies);
    vi.restoreAllMocks();
  });

  it('proxies origin and schedules async tracking', async () => {
    const originResponse = new Response('origin', {
      status: 200,
      headers: { 'content-length': '6' }
    });
    const fetchMock = vi.fn().mockResolvedValue(originResponse);
    global.fetch = fetchMock as unknown as typeof fetch;
    const sendSpy = vi
      .spyOn(http, 'sendMatomoHit')
      .mockResolvedValue(undefined);

    const response = await worker.fetch(
      new Request('https://example.com/path', {
        headers: { 'user-agent': 'AgentX' }
      }),
      env,
      { waitUntil }
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(waitUntil).toHaveBeenCalledTimes(1);
    await waitUntil.mock.calls[0][0];
    expect(sendSpy).toHaveBeenCalledTimes(1);
  });

  it('returns origin redirect without tracking it', async () => {
    const originResponse = new Response(null, {
      status: 301,
      headers: { location: 'https://example.com/path/' }
    });
    global.fetch = vi
      .fn()
      .mockResolvedValue(originResponse) as unknown as typeof fetch;
    const sendSpy = vi
      .spyOn(http, 'sendMatomoHit')
      .mockResolvedValue(undefined);

    const response = await worker.fetch(
      new Request('https://example.com/path', {
        headers: { 'user-agent': 'AgentX' }
      }),
      env,
      { waitUntil }
    );

    expect(response.status).toBe(301);
    expect(response.headers.get('location')).toBe('https://example.com/path/');
    await waitUntil.mock.calls[0][0];
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('returns fallback when origin fails but still tracks', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('boom'));
    global.fetch = fetchMock as unknown as typeof fetch;
    const sendSpy = vi
      .spyOn(http, 'sendMatomoHit')
      .mockResolvedValue(undefined);

    const response = await worker.fetch(
      new Request('https://example.com/path', {
        headers: { 'user-agent': 'AgentX' }
      }),
      env,
      { waitUntil }
    );

    expect(response.status).toBe(502);
    expect(waitUntil).toHaveBeenCalledTimes(1);
    await waitUntil.mock.calls[0][0];
    expect(sendSpy).toHaveBeenCalledTimes(1);
  });

  it('skips tracking when user agent not allowed', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('origin', { status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const sendSpy = vi
      .spyOn(http, 'sendMatomoHit')
      .mockResolvedValue(undefined);
    const response = await worker.fetch(
      new Request('https://example.com/path', {
        headers: { 'user-agent': 'OtherUA' }
      }),
      { ...env, USER_AGENT_ALLOWLIST_REGEX: 'AllowedUA' },
      { waitUntil }
    );
    expect(response.status).toBe(200);
    await waitUntil.mock.calls[0][0];
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('logs warning when tracking fails', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('origin', { status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;
    vi.spyOn(http, 'sendMatomoHit').mockRejectedValue(new Error('track fail'));

    const response = await worker.fetch(
      new Request('https://example.com/path', {
        headers: { 'user-agent': 'AgentX' }
      }),
      env,
      { waitUntil }
    );

    expect(response.status).toBe(200);
    await waitUntil.mock.calls[0][0];
    expect(consoleWarn).toHaveBeenCalledWith(
      'Tracking failed',
      expect.objectContaining({ error: 'track fail' })
    );
    consoleWarn.mockRestore();
  });

  it('returns origin response when config is invalid and skips tracking', async () => {
    const originResponse = new Response('origin', { status: 200 });
    const fetchMock = vi.fn().mockResolvedValue(originResponse);
    global.fetch = fetchMock as unknown as typeof fetch;
    const sendSpy = vi
      .spyOn(http, 'sendMatomoHit')
      .mockResolvedValue(undefined);

    const response = await worker.fetch(
      new Request('https://example.com/path'),
      { MATOMO_SITE_ID: '7' } as never,
      { waitUntil }
    );
    expect(response.status).toBe(200);
    expect(waitUntil).not.toHaveBeenCalled();
    expect(sendSpy).not.toHaveBeenCalled();
    expect(consoleSpies.error).toHaveBeenCalledWith(
      'Configuration error',
      expect.objectContaining({ error: expect.stringContaining('MATOMO_URL') })
    );
  });
});
