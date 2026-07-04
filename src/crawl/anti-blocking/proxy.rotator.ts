import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Round-robin proxy rotation (Part 2). Reads PROXY_URLS (comma-separated,
 * credentials-in-URL supported) so the same code works with any provider:
 * datacenter lists, residential pools, or a VPN exposed as an HTTP proxy.
 * With no proxies configured the crawler fetches directly.
 */
@Injectable()
export class ProxyRotator {
  private readonly logger = new Logger(ProxyRotator.name);
  private readonly pool: string[];
  private cursor = 0;

  constructor(config: ConfigService) {
    this.pool = config
      .get<string>('PROXY_URLS', '')
      .split(',')
      .map((url) => url.trim())
      .filter(Boolean);
    if (this.pool.length > 0) {
      this.logger.log(
        `Proxy rotation enabled with ${this.pool.length} prox${this.pool.length === 1 ? 'y' : 'ies'}`,
      );
    } else {
      this.logger.log('No proxies configured — fetching directly');
    }
  }

  get enabled(): boolean {
    return this.pool.length > 0;
  }

  next(): string | null {
    if (this.pool.length === 0) return null;
    const proxy = this.pool[this.cursor % this.pool.length];
    this.cursor += 1;
    return proxy;
  }

  /** Strips credentials for safe logging / job results. */
  static mask(proxyUrl: string | null): string | null {
    if (!proxyUrl) return null;
    try {
      const url = new URL(proxyUrl);
      url.username = '';
      url.password = '';
      return url.href;
    } catch {
      return 'invalid-proxy-url';
    }
  }
}
