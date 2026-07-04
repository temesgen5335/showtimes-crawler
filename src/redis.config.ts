import { ConfigService } from '@nestjs/config';

export interface RedisConnection {
  host: string;
  port: number;
  username?: string;
  password?: string;
  tls?: Record<string, never>;
}

/**
 * Builds the BullMQ Redis connection from config.
 *
 * Prefers REDIS_URL when present (this is how managed hosts such as Render
 * expose their instance — e.g. redis://:pass@host:6379 or rediss://... for
 * TLS). Falls back to discrete REDIS_HOST / REDIS_PORT for local Docker.
 */
export function buildRedisConnection(config: ConfigService): RedisConnection {
  const url = config.get<string>('REDIS_URL');
  if (url) {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: parsed.port ? Number(parsed.port) : 6379,
      username: parsed.username || undefined,
      password: parsed.password || undefined,
      // rediss:// means TLS (external managed connections typically require it).
      tls: parsed.protocol === 'rediss:' ? {} : undefined,
    };
  }

  return {
    host: config.get<string>('REDIS_HOST', 'localhost'),
    port: config.get<number>('REDIS_PORT', 6379),
  };
}
