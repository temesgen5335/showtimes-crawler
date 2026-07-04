import axios from 'axios';
import { AxiosFetcher } from './axios.fetcher';

jest.mock('axios');
// https-proxy-agent is ESM-only; stub it so ts-jest (CommonJS) can load the
// fetcher. The specs assert that an agent instance is passed, not its type.
jest.mock('https-proxy-agent', () => ({
  HttpsProxyAgent: jest.fn().mockImplementation(() => ({ mockAgent: true })),
}));
const mockedAxios = axios as jest.Mocked<typeof axios>;

const OPTIONS = {
  userAgent: 'test-agent/1.0',
  proxyUrl: null,
  timeoutMs: 5000,
};

describe('AxiosFetcher', () => {
  let fetcher: AxiosFetcher;

  beforeEach(() => {
    jest.clearAllMocks();
    fetcher = new AxiosFetcher();
  });

  it('sends the rotated user agent and browser-like headers', async () => {
    mockedAxios.get.mockResolvedValue({
      data: '<html></html>',
      status: 200,
      request: {},
    });

    await fetcher.fetch('https://example.com', OPTIONS);

    const [url, config] = mockedAxios.get.mock.calls[0];
    expect(url).toBe('https://example.com');
    expect(config?.headers?.['User-Agent']).toBe('test-agent/1.0');
    expect(config?.headers?.Accept).toContain('text/html');
    expect(config?.timeout).toBe(5000);
    // axios' own env-based proxying must be disabled
    expect(config?.proxy).toBe(false);
  });

  it('fetches directly (no agent) when no proxy is configured', async () => {
    mockedAxios.get.mockResolvedValue({ data: '', status: 200, request: {} });
    await fetcher.fetch('https://example.com', OPTIONS);
    const [, config] = mockedAxios.get.mock.calls[0];
    expect(config?.httpsAgent).toBeUndefined();
  });

  it('routes through a proxy agent when a proxy is provided', async () => {
    mockedAxios.get.mockResolvedValue({ data: '', status: 200, request: {} });
    await fetcher.fetch('https://example.com', {
      ...OPTIONS,
      proxyUrl: 'http://user:pass@proxy:8080',
    });
    const [, config] = mockedAxios.get.mock.calls[0];
    expect(config?.httpsAgent).toBeDefined();
    expect(config?.httpAgent).toBeDefined();
  });

  it('returns the post-redirect URL when axios followed redirects', async () => {
    mockedAxios.get.mockResolvedValue({
      data: '<html></html>',
      status: 200,
      request: { res: { responseUrl: 'https://example.com/final' } },
    });

    const page = await fetcher.fetch('https://example.com', OPTIONS);
    expect(page.finalUrl).toBe('https://example.com/final');
    expect(page.statusCode).toBe(200);
    expect(page.html).toBe('<html></html>');
  });

  it('propagates fetch errors so the job is marked failed', async () => {
    mockedAxios.get.mockRejectedValue(new Error('timeout of 5000ms exceeded'));
    await expect(
      fetcher.fetch('https://example.com', OPTIONS),
    ).rejects.toThrow('timeout');
  });
});
