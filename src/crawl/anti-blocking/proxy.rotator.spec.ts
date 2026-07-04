import { ConfigService } from '@nestjs/config';
import { ProxyRotator } from './proxy.rotator';

describe('ProxyRotator', () => {
  it('returns null (direct fetch) when no proxies are configured', () => {
    const rotator = new ProxyRotator(new ConfigService({}));
    expect(rotator.enabled).toBe(false);
    expect(rotator.next()).toBeNull();
  });

  it('rotates round-robin through the configured pool', () => {
    const rotator = new ProxyRotator(
      new ConfigService({
        PROXY_URLS:
          'http://proxy-a:8080, http://proxy-b:8080,http://proxy-c:8080',
      }),
    );
    expect(rotator.enabled).toBe(true);
    expect(rotator.next()).toBe('http://proxy-a:8080');
    expect(rotator.next()).toBe('http://proxy-b:8080');
    expect(rotator.next()).toBe('http://proxy-c:8080');
    expect(rotator.next()).toBe('http://proxy-a:8080');
  });

  it('masks credentials for logging', () => {
    expect(ProxyRotator.mask('http://user:secret@proxy:8080')).toBe(
      'http://proxy:8080/',
    );
    expect(ProxyRotator.mask(null)).toBeNull();
    expect(ProxyRotator.mask('not a url')).toBe('invalid-proxy-url');
  });
});
