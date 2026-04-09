import { request } from 'undici';

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3001';
const API_REQUEST_TIMEOUT_MS = Number(process.env.API_REQUEST_TIMEOUT_MS ?? 8_000);
const API_RETRY_ATTEMPTS = Math.max(1, Number(process.env.API_RETRY_ATTEMPTS ?? 3));
const API_RETRY_BASE_DELAY_MS = Number(process.env.API_RETRY_BASE_DELAY_MS ?? 250);

interface ProgressPayload {
  stage: string;
  percent: number;
  status?: 'PROCESSING' | 'SUCCESS' | 'ERROR';
  currentCredor?: string;
  successCount?: number;
  errorCount?: number;
  appendError?: { credorSlug?: string; code: string; message: string };
  credorUpdate?: {
    credorSlug: string;
    state: 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'ERROR';
    credorName?: string;
    numeroPgc?: string;
    periodo?: string;
    valorTotal?: number;
    flow?: string;
    warning?: string;
  };
  appendArtifact?: { type: 'CSV' | 'XLSX' | 'ZIP' | 'PDF'; path: string };
  expectedCredores?: string[];
}

interface JobStatusResponse {
  status: 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'ERROR' | 'CANCELED';
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableNetworkError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = String((error as { code?: string }).code ?? '');
  return [
    'ECONNRESET',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'UND_ERR_CONNECT_TIMEOUT',
    'UND_ERR_HEADERS_TIMEOUT',
    'UND_ERR_SOCKET',
  ].includes(code);
}

async function requestWithRetry(url: string, options: Parameters<typeof request>[1]): Promise<void> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= API_RETRY_ATTEMPTS; attempt += 1) {
    try {
      await request(url, {
        ...options,
        headersTimeout: API_REQUEST_TIMEOUT_MS,
        bodyTimeout: API_REQUEST_TIMEOUT_MS,
      });
      return;
    } catch (error) {
      lastError = error;

      if (!isRetryableNetworkError(error) || attempt === API_RETRY_ATTEMPTS) {
        throw error;
      }

      const delayMs = API_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
      await wait(delayMs);
    }
  }

  throw lastError;
}

export async function postProgress(requestId: string, payload: ProgressPayload): Promise<void> {
  await requestWithRetry(`${API_BASE_URL}/jobs/${requestId}/internal-progress`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function isJobCanceled(requestId: string): Promise<boolean> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= API_RETRY_ATTEMPTS; attempt += 1) {
    try {
      const res = await request(`${API_BASE_URL}/jobs/${requestId}/status`, {
        method: 'GET',
        headersTimeout: API_REQUEST_TIMEOUT_MS,
        bodyTimeout: API_REQUEST_TIMEOUT_MS,
      });

      // On server-side transient failures, retry before deciding.
      if (res.statusCode >= 500) {
        if (attempt === API_RETRY_ATTEMPTS) return false;
        const delayMs = API_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
        await wait(delayMs);
        continue;
      }

      if (res.statusCode >= 400) {
        return false;
      }

      const body = (await res.body.json()) as JobStatusResponse;
      return body.status === 'CANCELED';
    } catch (error) {
      lastError = error;
      if (!isRetryableNetworkError(error) || attempt === API_RETRY_ATTEMPTS) {
        return false;
      }

      const delayMs = API_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
      await wait(delayMs);
    }
  }

  void lastError;
  return false;
}
