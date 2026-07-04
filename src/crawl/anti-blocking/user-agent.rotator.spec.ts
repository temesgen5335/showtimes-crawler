import { ConfigService } from '@nestjs/config';
import { UserAgentRotator } from './user-agent.rotator';

describe('UserAgentRotator', () => {
  it('rotates through the pool round-robin and wraps around', () => {
    const rotator = new UserAgentRotator(new ConfigService({}));
    const first = rotator.next();
    const seen = new Set([first]);
    let wrapped = false;
    for (let i = 0; i < 20; i += 1) {
      const ua = rotator.next();
      if (ua === first) {
        wrapped = true;
        break;
      }
      seen.add(ua);
    }
    expect(wrapped).toBe(true);
    expect(seen.size).toBeGreaterThan(1);
  });

  it('returns realistic browser user agents', () => {
    const rotator = new UserAgentRotator(new ConfigService({}));
    expect(rotator.next()).toMatch(/^Mozilla\/5\.0/);
  });

  it('uses the USER_AGENTS env override when provided', () => {
    const rotator = new UserAgentRotator(
      new ConfigService({ USER_AGENTS: 'custom-ua-1, custom-ua-2' }),
    );
    expect(rotator.next()).toBe('custom-ua-1');
    expect(rotator.next()).toBe('custom-ua-2');
    expect(rotator.next()).toBe('custom-ua-1');
  });
});
