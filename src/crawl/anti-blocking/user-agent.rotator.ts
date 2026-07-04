import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Round-robin user-agent rotation (Part 2). A realistic, current UA pool
 * avoids the most common block heuristic: a missing or obviously
 * programmatic User-Agent header. The pool can be overridden with the
 * USER_AGENTS env variable (comma-separated) without a code change.
 */
@Injectable()
export class UserAgentRotator {
  private static readonly DEFAULT_POOL = [
    // Chrome / Windows
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    // Chrome / macOS
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    // Firefox / Windows
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
    // Firefox / Linux
    'Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0',
    // Safari / macOS
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
    // Edge / Windows
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0',
  ];

  private readonly pool: string[];
  private cursor = 0;

  constructor(config: ConfigService) {
    const fromEnv = config
      .get<string>('USER_AGENTS', '')
      .split(',')
      .map((ua) => ua.trim())
      .filter(Boolean);
    this.pool = fromEnv.length > 0 ? fromEnv : UserAgentRotator.DEFAULT_POOL;
  }

  next(): string {
    const userAgent = this.pool[this.cursor % this.pool.length];
    this.cursor += 1;
    return userAgent;
  }
}
