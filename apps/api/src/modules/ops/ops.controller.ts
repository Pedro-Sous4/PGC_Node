import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Registry, collectDefaultMetrics } from 'prom-client';

const register = new Registry();
collectDefaultMetrics({ register });

@Controller()
export class OpsController {
  @Get('health')
  health() {
    return { status: 'ok', service: 'pgc-api', ts: new Date().toISOString() };
  }

  @Get('ready')
  ready() {
    const databaseReady = true;
    const redisReady = true;

    if (!databaseReady || !redisReady) {
      throw new ServiceUnavailableException({
        status: 'not-ready',
        databaseReady,
        redisReady,
      });
    }

    return { status: 'ready', databaseReady, redisReady };
  }

  @Get('metrics')
  async metrics(): Promise<string> {
    return register.metrics();
  }
}
