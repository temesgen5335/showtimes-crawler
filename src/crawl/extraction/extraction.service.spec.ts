import { ExtractionService } from './extraction.service';

const BASE = 'https://example.com/movies/';

const FIXTURE = `
<!doctype html>
<html>
<head>
  <title>  Example Cinema — Showtimes  </title>
  <meta name="description" content="Find showtimes near you.">
  <link rel="icon" href="/assets/favicon.png">
  <link rel="stylesheet" href="/css/main.css">
  <link rel="stylesheet" href="https://cdn.example.com/theme.css">
  <link rel="stylesheet" href="/css/main.css">
  <script src="/js/app.js"></script>
  <script>console.log('inline, no src');</script>
</head>
<body>
  <script src="https://cdn.example.com/analytics.js"></script>
  <img src="poster.jpg">
  <img src="/images/logo.svg">
  <img src="data:image/gif;base64,R0lGOD==">
  <img alt="no src attribute">
</body>
</html>`;

describe('ExtractionService', () => {
  let service: ExtractionService;

  beforeEach(() => {
    service = new ExtractionService();
  });

  it('extracts and trims the page title', () => {
    const result = service.extract(FIXTURE, BASE);
    expect(result.title).toBe('Example Cinema — Showtimes');
  });

  it('extracts the meta description', () => {
    const result = service.extract(FIXTURE, BASE);
    expect(result.metaDescription).toBe('Find showtimes near you.');
  });

  it('falls back to og:description when meta description is missing', () => {
    const html = `<head><meta property="og:description" content="OG text"></head>`;
    expect(service.extract(html, BASE).metaDescription).toBe('OG text');
  });

  it('resolves the declared favicon against the page URL', () => {
    const result = service.extract(FIXTURE, BASE);
    expect(result.favicon).toBe('https://example.com/assets/favicon.png');
  });

  it('supports legacy rel="shortcut icon"', () => {
    const html = `<head><link rel="shortcut icon" href="fav.ico"></head>`;
    expect(service.extract(html, BASE).favicon).toBe(
      'https://example.com/movies/fav.ico',
    );
  });

  it('falls back to /favicon.ico when no icon link is declared', () => {
    const html = `<head><title>x</title></head>`;
    expect(service.extract(html, BASE).favicon).toBe(
      'https://example.com/favicon.ico',
    );
  });

  it('collects script URLs, ignoring inline scripts', () => {
    const result = service.extract(FIXTURE, BASE);
    expect(result.scripts).toEqual([
      'https://example.com/js/app.js',
      'https://cdn.example.com/analytics.js',
    ]);
  });

  it('collects stylesheet URLs and de-duplicates them', () => {
    const result = service.extract(FIXTURE, BASE);
    expect(result.stylesheets).toEqual([
      'https://example.com/css/main.css',
      'https://cdn.example.com/theme.css',
    ]);
  });

  it('resolves relative image URLs and skips data URIs and missing src', () => {
    const result = service.extract(FIXTURE, BASE);
    expect(result.images).toEqual([
      'https://example.com/movies/poster.jpg',
      'https://example.com/images/logo.svg',
    ]);
  });

  it('returns nulls and empty lists for an empty document', () => {
    const result = service.extract('<html></html>', BASE);
    expect(result.title).toBeNull();
    expect(result.metaDescription).toBeNull();
    expect(result.scripts).toEqual([]);
    expect(result.stylesheets).toEqual([]);
    expect(result.images).toEqual([]);
    // favicon still falls back to the conventional location
    expect(result.favicon).toBe('https://example.com/favicon.ico');
  });
});
