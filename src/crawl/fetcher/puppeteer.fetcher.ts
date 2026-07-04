import { Injectable, Logger } from '@nestjs/common';
import * as puppeteer from 'puppeteer';
import {
  FetchedPage,
  FetchOptions,
  PageFetcher,
} from './page-fetcher.interface';

/**
 * Headless-browser fetcher (Part 2): executes JavaScript, so it sees the DOM
 * a real visitor sees — required for SPA/JS-rendered sites and a first step
 * against fingerprinting-based bot detection.
 *
 * A browser is launched per fetch. That is deliberate for this test task:
 * it is simple, leak-free and gives per-job proxy selection (Chromium only
 * accepts --proxy-server at launch). At production scale a warm browser
 * pool keyed by proxy would amortise the ~1s launch cost — see README.
 */
@Injectable()
export class PuppeteerFetcher implements PageFetcher {
  private readonly logger = new Logger(PuppeteerFetcher.name);

  async fetch(url: string, options: FetchOptions): Promise<FetchedPage> {
    // Baseline flags for running Chromium in a container: --no-sandbox is
    // required when running as root (as in Docker/Render), and
    // --disable-dev-shm-usage avoids crashes from the small /dev/shm that
    // containers ship with.
    const args = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'];
    let credentials: { username: string; password: string } | undefined;

    if (options.proxyUrl) {
      const proxy = new URL(options.proxyUrl);
      args.push(`--proxy-server=${proxy.protocol}//${proxy.host}`);
      if (proxy.username) {
        credentials = {
          username: decodeURIComponent(proxy.username),
          password: decodeURIComponent(proxy.password),
        };
      }
    }

    const browser = await puppeteer.launch({
      headless: true,
      args,
      // In containers we install a system Chromium and point Puppeteer at it
      // via PUPPETEER_EXECUTABLE_PATH; locally this is unset and Puppeteer
      // uses its own downloaded build.
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    });
    try {
      const page = await browser.newPage();
      if (credentials) await page.authenticate(credentials);
      await page.setUserAgent(options.userAgent);
      await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });

      const response = await page.goto(url, {
        // networkidle2 waits until the page has (mostly) stopped loading
        // resources, so lazily injected scripts/images are in the DOM.
        waitUntil: 'networkidle2',
        timeout: options.timeoutMs,
      });

      const html = await page.content();
      const statusCode = response?.status() ?? null;
      this.logger.debug(`goto ${url} -> ${statusCode} (${page.url()})`);
      return { html, finalUrl: page.url(), statusCode };
    } finally {
      await browser.close();
    }
  }
}
