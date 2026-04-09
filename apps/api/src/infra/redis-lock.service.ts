import { ConflictException, Injectable } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisLockService {
  private readonly redis: Redis;

  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST ?? 'localhost',
      port: Number(process.env.REDIS_PORT ?? 6379),
      maxRetriesPerRequest: null,
    });
  }

  async withRequestLock<T>(requestId: string, fn: () => Promise<T>, ttlMs = 30_000): Promise<T> {
    const key = `pgc:lock:${requestId}`;
    const token = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const acquired = await this.redis.set(key, token, 'PX', ttlMs, 'NX');
    if (acquired !== 'OK') {
      throw new ConflictException('request_id em processamento concorrente');
    }

    try {
      return await fn();
    } finally {
      const releaseScript = `
        if redis.call('GET', KEYS[1]) == ARGV[1] then
          return redis.call('DEL', KEYS[1])
        end
        return 0
      `;
      await this.redis.eval(releaseScript, 1, key, token);
    }
  }
}
