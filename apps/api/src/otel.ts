import { NodeSDK } from '@opentelemetry/sdk-node';

export function startOtel(): void {
  if (process.env.OTEL_ENABLED !== 'true') {
    return;
  }

  const sdk = new NodeSDK();

  void sdk.start();
}
