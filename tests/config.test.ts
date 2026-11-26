import { describe, expect, it } from 'vitest';
import { getConfig } from '../src/config.js';

const baseEnv = {
  MATOMO_URL: 'https://analytics.example.com',
  MATOMO_SITE_ID: '42'
};

describe('getConfig', () => {
  it('reads required fields and defaults', () => {
    const config = getConfig({ ...baseEnv });
    expect(config).toMatchObject({
      matomoUrl: baseEnv.MATOMO_URL,
      matomoSiteId: 42,
      matomoTimeoutMs: 5000,
      logLevel: 'warn',
      httpMethodAllowlist: ['GET'],
      trackHttpRedirects: false
    });
    expect(config.userAgentAllowlistRegex).toEqual(
      /(?:ChatGPT-User|MistralAI-User|Gemini-Deep-Research|Claude-User|Perplexity-User|Google-NotebookLM|Google-GeminiNotebook)/i
    );
    expect(config.urlExcludeRegex).toEqual(
      /^[^?]+\.(?:css|js|mjs|map|json|xml|webmanifest|manifest|png|jpe?g|gif|webp|avif|svg|ico|bmp|tiff?|woff2?|ttf|otf|eot|rss|atom|wasm|txt)(?:\?|$)/i
    );
    expect(config.documentRegex).toEqual(
      /^[^?]+\.(?:pdf|docx?|xlsx?|pptx?|csv|json|txt|xml|epub|mobi|azw3|mp3|mp4|mpe?g|webm|mov|avi|ogg|wav|flac|zip|gz|gzip|tgz|tar|bz2|tbz|7z|rar|dmg|exe|msi|apk|jar|md5|sig)(?:\?|$)/i
    );
  });

  it('allows both NotebookLM user agent tokens by default', () => {
    const { userAgentAllowlistRegex } = getConfig({ ...baseEnv });
    const userAgents = [
      // current desktop and mobile agents
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36 (compatible; Google-GeminiNotebook; +https://developers.google.com/crawling/docs/crawlers-fetchers/google-gemininotebook)',
      'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36 (compatible; Google-GeminiNotebook; +https://developers.google.com/crawling/docs/crawlers-fetchers/google-gemininotebook)',
      // former agent, supported until August 2026
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36 (compatible; Google-NotebookLM; +https://developers.google.com/crawling/docs/crawlers-fetchers/google-notebooklm)'
    ];
    for (const userAgent of userAgents) {
      expect(userAgentAllowlistRegex?.test(userAgent)).toBe(true);
    }
  });

  it('uses optional overrides', () => {
    const config = getConfig({
      ...baseEnv,
      MATOMO_TIMEOUT_MS: '8000',
      LOG_LEVEL: 'debug',
      HTTP_METHOD_ALLOWLIST: 'get, post',
      TRACK_HTTP_REDIRECTS: 'true',
      USER_AGENT_ALLOWLIST_REGEX: 'CustomBot',
      URL_EXCLUDE_REGEX: '\\.(?:js|css)$',
      DOCUMENT_REGEX: '\\.custom$'
    });
    expect(config).toMatchObject({
      matomoUrl: baseEnv.MATOMO_URL,
      matomoSiteId: 42,
      matomoTimeoutMs: 8000,
      logLevel: 'debug',
      httpMethodAllowlist: ['GET', 'POST'],
      trackHttpRedirects: true
    });
    expect(config.userAgentAllowlistRegex).toEqual(/CustomBot/i);
    expect(config.urlExcludeRegex).toEqual(/\.(?:js|css)$/i);
    expect(config.documentRegex).toEqual(/\.custom$/i);
  });

  it('defaults to GET when HTTP_METHOD_ALLOWLIST is empty/blank', () => {
    expect(
      getConfig({ ...baseEnv, HTTP_METHOD_ALLOWLIST: '' }).httpMethodAllowlist
    ).toEqual(['GET']);
    expect(
      getConfig({ ...baseEnv, HTTP_METHOD_ALLOWLIST: '   ' })
        .httpMethodAllowlist
    ).toEqual(['GET']);
  });

  it('throws on invalid regex config', () => {
    expect(() =>
      getConfig({ ...baseEnv, USER_AGENT_ALLOWLIST_REGEX: '[' })
    ).toThrow(/Invalid USER_AGENT_ALLOWLIST_REGEX/);
    expect(() => getConfig({ ...baseEnv, URL_EXCLUDE_REGEX: '[' })).toThrow(
      /Invalid URL_EXCLUDE_REGEX/
    );
    expect(() => getConfig({ ...baseEnv, DOCUMENT_REGEX: '[' })).toThrow(
      /Invalid DOCUMENT_REGEX/
    );
  });

  it('parses TRACK_HTTP_REDIRECTS case-insensitively', () => {
    const parse = (value: string) =>
      getConfig({ ...baseEnv, TRACK_HTTP_REDIRECTS: value }).trackHttpRedirects;
    expect(parse('TRUE')).toBe(true);
    expect(parse(' 1 ')).toBe(true);
    expect(parse('false')).toBe(false);
    expect(parse('0')).toBe(false);
    expect(parse('')).toBe(false);
  });

  it('throws on invalid TRACK_HTTP_REDIRECTS', () => {
    expect(() =>
      getConfig({ ...baseEnv, TRACK_HTTP_REDIRECTS: 'yes' })
    ).toThrow(/Invalid TRACK_HTTP_REDIRECTS/);
  });

  it('throws on invalid HTTP_METHOD_ALLOWLIST', () => {
    expect(() => getConfig({ ...baseEnv, HTTP_METHOD_ALLOWLIST: '$' })).toThrow(
      /Invalid HTTP_METHOD_ALLOWLIST/
    );
    expect(() => getConfig({ ...baseEnv, HTTP_METHOD_ALLOWLIST: ',' })).toThrow(
      /HTTP_METHOD_ALLOWLIST must include at least one method/
    );
  });

  it('throws when MATOMO_URL is missing', () => {
    expect(() => getConfig({ MATOMO_SITE_ID: '1' })).toThrow(
      /MATOMO_URL is required/
    );
  });

  it('throws when MATOMO_SITE_ID is missing', () => {
    expect(() => getConfig({ MATOMO_URL: baseEnv.MATOMO_URL })).toThrow(
      /MATOMO_SITE_ID is required/
    );
  });

  it('throws when MATOMO_SITE_ID is empty string', () => {
    expect(() =>
      getConfig({ MATOMO_URL: baseEnv.MATOMO_URL, MATOMO_SITE_ID: '' })
    ).toThrow(/MATOMO_SITE_ID is required/);
  });

  it('throws when numeric fields are not integers', () => {
    expect(() => getConfig({ ...baseEnv, MATOMO_SITE_ID: 'abc' })).toThrow(
      /Expected integer value/
    );
    expect(() => getConfig({ ...baseEnv, MATOMO_TIMEOUT_MS: 'abc' })).toThrow(
      /Expected integer value/
    );
  });
});
