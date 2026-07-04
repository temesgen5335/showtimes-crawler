import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import {
  FetchedPage,
  FetchOptions,
  PageFetcher,
} from './page-fetcher.interface';

/**
 * Plain-HTTP fetcher (Part 1): fast and cheap, right choice for static or
 * server-rendered HTML. Sends browser-like headers; supports authenticated
 * HTTP(S) proxies via https-proxy-agent.
 */
@Injectable()
export class AxiosFetcher implements PageFetcher {
  private readonly logger = new Logger(AxiosFetcher.name);

  async fetch(url: string, options: FetchOptions): Promise<FetchedPage> {
    const proxyAgent = options.proxyUrl
      ? new HttpsProxyAgent(options.proxyUrl)
      : undefined;

    const response = await axios.get<string>(url, {
      timeout: options.timeoutMs,
      maxRedirects: 5,
      responseType: 'text',
      // Use our explicit agent; disable axios' built-in env-based proxying
      // so behaviour is controlled only by the ProxyRotator.
      proxy: false,
      httpAgent: proxyAgent,
      httpsAgent: proxyAgent,
      headers: {
        'User-Agent': options.userAgent,
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        Connection: 'keep-alive',
      },
      // Treat redirects as success; 4xx/5xx should surface as job failures.
      validateStatus: (status) => status >= 200 && status < 400,
    });

    // Axios exposes the post-redirect URL on the underlying response object.
    const finalUrl: string =
      (response.request?.res?.responseUrl as string | undefined) ?? url;

    this.logger.debug(`GET ${url} -> ${response.status} (${finalUrl})`);
    return { html: response.data, finalUrl, statusCode: response.status };
  }
}
