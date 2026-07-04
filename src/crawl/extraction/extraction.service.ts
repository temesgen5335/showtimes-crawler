import { Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';
import { ExtractedPageData } from '../crawl.types';

/**
 * Pure HTML → data extraction. No I/O: takes markup that a fetcher already
 * retrieved, which keeps this trivially unit-testable against fixtures.
 */
@Injectable()
export class ExtractionService {
  extract(html: string, baseUrl: string): ExtractedPageData {
    const $ = cheerio.load(html);

    const title = $('head title').first().text().trim() || null;

    const metaDescription =
      $('meta[name="description"]').attr('content')?.trim() ||
      $('meta[property="og:description"]').attr('content')?.trim() ||
      null;

    return {
      title,
      metaDescription,
      favicon: this.extractFavicon($, baseUrl),
      scripts: this.extractUrls($, 'script[src]', 'src', baseUrl),
      stylesheets: this.extractUrls(
        $,
        'link[rel~="stylesheet"][href]',
        'href',
        baseUrl,
      ),
      images: this.extractUrls($, 'img[src]', 'src', baseUrl),
    };
  }

  private extractFavicon($: cheerio.CheerioAPI, baseUrl: string): string | null {
    // rel~="icon" matches both rel="icon" and legacy rel="shortcut icon".
    const declared =
      $('link[rel~="icon"][href]').first().attr('href') ??
      $('link[rel="apple-touch-icon"][href]').first().attr('href');
    if (declared) {
      const resolved = this.resolveUrl(declared, baseUrl);
      if (resolved) return resolved;
    }
    // Browsers fall back to /favicon.ico when no <link rel="icon"> exists.
    return this.resolveUrl('/favicon.ico', baseUrl);
  }

  private extractUrls(
    $: cheerio.CheerioAPI,
    selector: string,
    attribute: string,
    baseUrl: string,
  ): string[] {
    const urls = $(selector)
      .map((_, el) => $(el).attr(attribute))
      .get()
      .map((raw) => this.resolveUrl(raw, baseUrl))
      .filter((url): url is string => url !== null);
    return [...new Set(urls)];
  }

  /**
   * Resolves a possibly-relative URL against the page URL. Returns null for
   * non-fetchable references (data URIs, javascript:, malformed values).
   */
  private resolveUrl(raw: string | undefined, baseUrl: string): string | null {
    if (!raw) return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;
    try {
      const url = new URL(trimmed, baseUrl);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
      return url.href;
    } catch {
      return null;
    }
  }
}
