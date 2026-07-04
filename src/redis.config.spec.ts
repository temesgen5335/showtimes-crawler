import { ConfigService } from '@nestjs/config';
import { buildRedisConnection } from './redis.config';

describe('buildRedisConnection', () => {
  it('falls back to REDIS_HOST / REDIS_PORT when no URL is set', () => {
    const conn = buildRedisConnection(
      new ConfigService({ REDIS_HOST: 'redis', REDIS_PORT: 6380 }),
    );
    expect(conn).toEqual({ host: 'redis', port: 6380 });
  });

  it('defaults to localhost:6379 with no config at all', () => {
    const conn = buildRedisConnection(new ConfigService({}));
    expect(conn).toEqual({ host: 'localhost', port: 6379 });
  });

  it('parses a plain redis:// URL (managed host, e.g. Render internal)', () => {
    const conn = buildRedisConnection(
      new ConfigService({ REDIS_URL: 'redis://:s3cret@red-abc123:6379' }),
    );
    expect(conn.host).toBe('red-abc123');
    expect(conn.port).toBe(6379);
    expect(conn.password).toBe('s3cret');
    expect(conn.tls).toBeUndefined();
  });

  it('enables TLS for a rediss:// URL', () => {
    const conn = buildRedisConnection(
      new ConfigService({ REDIS_URL: 'rediss://user:pw@host.example.com:6380' }),
    );
    expect(conn.host).toBe('host.example.com');
    expect(conn.port).toBe(6380);
    expect(conn.username).toBe('user');
    expect(conn.tls).toEqual({});
  });

  it('prefers REDIS_URL over discrete host/port when both are present', () => {
    const conn = buildRedisConnection(
      new ConfigService({
        REDIS_URL: 'redis://red-xyz:6379',
        REDIS_HOST: 'localhost',
        REDIS_PORT: 1111,
      }),
    );
    expect(conn.host).toBe('red-xyz');
  });
});
