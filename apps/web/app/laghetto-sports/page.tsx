'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { DashboardShell } from '../components/dashboard-shell';
import { sportsDownload, sportsLogs, sportsStatus, sportsUpload } from '../../lib/api';
import { ActionButton, SectionCard, StatusBadge } from '../components/ui';

type SportsCredor = {
  credorSlug: string;
  credorName?: string;
  state: string;
  message?: string;
};

type SportsStatus = {
  status: string;
  stage: string;
  percent: number;
  successCount: number;
  errorCount: number;
  createdAt?: string;
  updatedAt?: string;
  credores?: SportsCredor[];
};

type ProgressSample = {
  tsMs: number;
  percent: number;
  stage: string;
};

function formatElapsed(totalSeconds: number): string {
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

function formatEta(totalSeconds: number): string {
  if (totalSeconds <= 0) return 'menos de 1 min';
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return `${minutes}m ${seconds}s`;
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  return `${hours}h ${remMinutes}m`;
}

function stageStallThresholdSeconds(stage?: string): number {
  switch (stage) {
    case 'INGESTION':
      return 120;
    case 'MINIMO':
    case 'DESCONTOS':
      return 90;
    case 'CREDOR_LOOP':
      return 120;
    case 'ARTIFACTS':
      return 90;
    default:
      return 75;
  }
}

function stageLabel(stage?: string): string {
  switch (stage) {
    case 'UPLOAD_RECEIVED':
      return 'Upload recebido';
    case 'INGESTION':
      return 'Leitura de dados';
    case 'MINIMO':
      return 'Cálculo de mínimo';
    case 'DESCONTOS':
      return 'Cálculo de descontos';
    case 'CREDOR_LOOP':
      return 'Processamento por credor';
    case 'ARTIFACTS':
      return 'Gerando artefatos';
    case 'FINISHED':
      return 'Finalizado';
    default:
      return stage || '-';
  }
}

function normalizeCredorToken(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export default function LaghettoSportsPage() {
  const [file, setFile] = useState<File | null>(null);
  const [credoresCsv, setCredoresCsv] = useState('');
  const [requestId, setRequestId] = useState('');
  const [status, setStatus] = useState<SportsStatus | null>(null);
  const [logs, setLogs] = useState<Array<{ ts: string; level: string; message: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [nowMs, setNowMs] = useState<number>(Date.now());
  const [progressSamples, setProgressSamples] = useState<ProgressSample[]>([]);

  const refresh = useCallback(async () => {
    if (!requestId) return;
    setError(null);
    try {
      const [s, l] = await Promise.all([sportsStatus(requestId), sportsLogs(requestId)]);
      setStatus(s);
      setLogs(l.logs ?? []);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [requestId]);

  useEffect(() => {
    if (!requestId || !autoRefresh) return;
    const done = status?.stage === 'FINISHED' || status?.status === 'SUCCESS' || status?.status === 'ERROR';
    if (done) return;

    const id = setInterval(() => {
      refresh();
    }, 1500);

    return () => clearInterval(id);
  }, [requestId, autoRefresh, status?.stage, status?.status, refresh]);

  const processingCredores = useMemo(
    () => (status?.credores ?? []).filter((c) => c.state === 'PROCESSING'),
    [status?.credores],
  );

  const credoresPreview = useMemo(() => {
    const rawItems = credoresCsv
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    const uniqueByNormalized = new Map<string, string>();
    for (const item of rawItems) {
      const normalized = normalizeCredorToken(item);
      if (!normalized) continue;
      if (!uniqueByNormalized.has(normalized)) {
        uniqueByNormalized.set(normalized, item);
      }
    }

    const valid = Array.from(uniqueByNormalized.values());
    return {
      rawCount: rawItems.length,
      recognizedCount: valid.length,
      removedDuplicates: Math.max(0, rawItems.length - valid.length),
      sample: valid.slice(0, 5),
    };
  }, [credoresCsv]);

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const secondsWithoutUpdate = useMemo(() => {
    if (!status?.updatedAt) return null;
    const updatedAtMs = new Date(status.updatedAt).getTime();
    if (!Number.isFinite(updatedAtMs)) return null;
    return Math.max(0, Math.floor((nowMs - updatedAtMs) / 1000));
  }, [status?.updatedAt, nowMs]);

  const possiblyStalled =
    status?.status === 'PROCESSING' &&
    status?.stage !== 'FINISHED' &&
    secondsWithoutUpdate !== null &&
    secondsWithoutUpdate > stageStallThresholdSeconds(status?.stage);

  useEffect(() => {
    if (!status?.updatedAt || !status?.status) return;
    const tsMs = new Date(status.updatedAt).getTime();
    if (!Number.isFinite(tsMs)) return;

    setProgressSamples((previous) => {
      const hasSameTimestamp = previous.some((sample) => sample.tsMs === tsMs);
      if (hasSameTimestamp) return previous;

      const next = [
        ...previous,
        {
          tsMs,
          percent: Number(status.percent) || 0,
          stage: status.stage,
        },
      ];

      // Mantem historico curto para ETA recente sem crescer indefinidamente.
      return next.slice(-120);
    });
  }, [status?.updatedAt, status?.percent, status?.stage, status?.status]);

  const secondsWithoutPercentProgress = useMemo(() => {
    if (progressSamples.length < 2) return null;

    const latest = progressSamples[progressSamples.length - 1];
    let markerTs = latest.tsMs;
    let markerPercent = latest.percent;

    for (let i = progressSamples.length - 2; i >= 0; i -= 1) {
      const sample = progressSamples[i];
      if (sample.percent < markerPercent) break;
      markerTs = sample.tsMs;
      markerPercent = sample.percent;
    }

    return Math.max(0, Math.floor((latest.tsMs - markerTs) / 1000));
  }, [progressSamples]);

  const etaInfo = useMemo(() => {
    if (!status || status.status !== 'PROCESSING') {
      return { etaSeconds: null as number | null, ratePerMinute: null as number | null };
    }

    if (progressSamples.length < 2) {
      return { etaSeconds: null as number | null, ratePerMinute: null as number | null };
    }

    const latest = progressSamples[progressSamples.length - 1];
    const windowStart = progressSamples.find((sample) => latest.tsMs - sample.tsMs <= 5 * 60 * 1000) ?? progressSamples[0];
    const deltaPercent = latest.percent - windowStart.percent;
    const deltaSeconds = Math.max(1, Math.floor((latest.tsMs - windowStart.tsMs) / 1000));

    if (deltaPercent <= 0) {
      return { etaSeconds: null as number | null, ratePerMinute: null as number | null };
    }

    const ratePerSecond = deltaPercent / deltaSeconds;
    const remainingPercent = Math.max(0, 100 - (Number(status.percent) || 0));
    const etaSeconds = Math.floor(remainingPercent / ratePerSecond);

    return {
      etaSeconds,
      ratePerMinute: Number((ratePerSecond * 60).toFixed(2)),
    };
  }, [status, progressSamples]);

  const statusDiagnosis = useMemo(() => {
    if (!status) return { label: 'Sem dados', tone: 'normal' as 'normal' | 'warning' | 'danger' };
    if (status.status === 'SUCCESS') return { label: 'Concluido com sucesso', tone: 'normal' as const };
    if (status.status === 'ERROR') return { label: 'Concluido com erro', tone: 'danger' as const };
    if (status.status === 'CANCELED') return { label: 'Cancelado', tone: 'warning' as const };

    if (possiblyStalled) {
      return {
        label: `Possivel travado: sem atualizar ha ${formatElapsed(secondsWithoutUpdate ?? 0)}`,
        tone: 'danger' as const,
      };
    }

    if ((secondsWithoutPercentProgress ?? 0) > Math.max(90, stageStallThresholdSeconds(status.stage))) {
      return {
        label: `Ativo, mas sem avancar percentual ha ${formatElapsed(secondsWithoutPercentProgress ?? 0)}`,
        tone: 'warning' as const,
      };
    }

    return { label: 'Processando normalmente', tone: 'normal' as const };
  }, [status, possiblyStalled, secondsWithoutUpdate, secondsWithoutPercentProgress]);

  async function handleUpload(event: FormEvent) {
    event.preventDefault();
    if (!file) return;
    setError(null);

    try {
      const response = await sportsUpload(file, credoresCsv);
      setRequestId(response.request_id);
      setStatus(null);
      setLogs([]);
      setAutoRefresh(true);
      setProgressSamples([]);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    if (!requestId) return;
    refresh();
  }, [requestId, refresh]);

  async function downloadZip() {
    if (!requestId) return;
    const data = await sportsDownload(requestId);
    const bytes = atob(data.content_base64);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i += 1) arr[i] = bytes.charCodeAt(i);
    const blob = new Blob([arr], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = data.file_name.replace('.base64', '');
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <DashboardShell
      activeNav="sports"
      title="Laghetto Sports"
      subtitle="Importação específica, status com atualização periódica, registros em tempo real e arquivo final para baixar"
    >
      <form onSubmit={handleUpload}>
        <SectionCard badge="Upload" title="Processamento Sports" subtitle="Suba arquivo e acompanhe a execução em tempo real" tone="primary">
        <label>
          Arquivo
          <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required />
        </label>
        <label>
          Credores (opcional, separados por vírgula)
          <input value={credoresCsv} onChange={(e) => setCredoresCsv(e.target.value)} />
        </label>
        {credoresCsv.trim() ? (
          <div style={{ marginTop: 8, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.72)' }}>
            <strong>Filtro reconhecido:</strong> {credoresPreview.recognizedCount} credor(es)
            {credoresPreview.removedDuplicates > 0
              ? ` (${credoresPreview.removedDuplicates} duplicado(s) removido(s))`
              : ''}
            <div style={{ marginTop: 6, color: 'var(--muted)' }}>
              {credoresPreview.sample.length > 0
                ? `Exemplo: ${credoresPreview.sample.join(', ')}${credoresPreview.recognizedCount > credoresPreview.sample.length ? ', ...' : ''}`
                : 'Nenhum nome válido reconhecido no filtro atual.'}
            </div>
          </div>
        ) : null}
        <p style={{ marginTop: 8, marginBottom: 0, color: 'var(--muted)' }}>
          Deixe em branco para processar todos os credores. Exemplo: credor-a,credor-b
        </p>

        <div className="actions-row" style={{ marginTop: 12 }}>
          <ActionButton type="submit" label="Iniciar processamento" icon="->" />
        </div>
        {requestId && <p className="mono">ID da solicitação: {requestId}</p>}
        {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
        </SectionCard>
      </form>

      <section className="grid two" style={{ marginTop: 16 }}>
        <SectionCard badge="Execução" title="Status da execução" tone="accent">
          {!status && <p>Sem dados ainda.</p>}
          {status && (
            <>
              <p>Status: <StatusBadge status={status.status} /></p>
              <p>Etapa: {stageLabel(status.stage)}</p>
              <p>Progresso: {status.percent}%</p>
              <p>
                Situacao agora:{' '}
                <span
                  style={{
                    color:
                      statusDiagnosis.tone === 'danger'
                        ? 'var(--danger)'
                        : statusDiagnosis.tone === 'warning'
                          ? '#9c5a00'
                          : 'inherit',
                    fontWeight: 600,
                  }}
                >
                  {statusDiagnosis.label}
                </span>
              </p>
              <p>
                Ultima atualizacao:{' '}
                {secondsWithoutUpdate === null ? '-' : `ha ${formatElapsed(secondsWithoutUpdate)}`}
              </p>
              <p>
                Sem avancar percentual:{' '}
                {secondsWithoutPercentProgress === null
                  ? '-'
                  : `ha ${formatElapsed(secondsWithoutPercentProgress)}`}
              </p>
              <p>
                Velocidade recente:{' '}
                {etaInfo.ratePerMinute === null ? '-' : `${etaInfo.ratePerMinute}%/min`}
              </p>
              <p>
                Estimativa restante:{' '}
                {etaInfo.etaSeconds === null
                  ? 'indisponivel (ainda sem historico suficiente de progresso)'
                  : formatEta(etaInfo.etaSeconds)}
              </p>
              {possiblyStalled && (
                <p style={{ color: 'var(--danger)', marginTop: 4 }}>
                  Sem nova atualizacao ha {formatElapsed(secondsWithoutUpdate ?? 0)}. Pode ser arquivo grande,
                  mas recomendamos acompanhar os registros para confirmar se continua ativo.
                </p>
              )}
              <div
                aria-label="Barra de progresso"
                style={{
                  width: '100%',
                  height: 12,
                  borderRadius: 999,
                  background: 'rgba(0,0,0,0.08)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${Math.max(0, Math.min(100, Number(status.percent) || 0))}%`,
                    height: '100%',
                    background: 'var(--primary)',
                    transition: 'width .3s ease',
                  }}
                />
              </div>
              <p>Sucesso: {status.successCount} | Erro: {status.errorCount}</p>
              <h4 style={{ marginBottom: 8 }}>Credores em processamento</h4>
              {processingCredores.length === 0 && <p>Nenhum credor em processamento no momento.</p>}
              {processingCredores.length > 0 && (
                <ul style={{ marginTop: 0 }}>
                  {processingCredores.map((item) => (
                    <li key={item.credorSlug}>{item.credorName || item.credorSlug}</li>
                  ))}
                </ul>
              )}
              {(status.credores ?? []).length > 0 && (
                <>
                  <h4 style={{ marginBottom: 8 }}>Resumo por credor</h4>
                  <ul style={{ marginTop: 0 }}>
                    {(status.credores ?? []).map((item) => (
                      <li key={item.credorSlug}>
                        {item.credorName || item.credorSlug}: {item.state}
                        {item.message ? ` - ${item.message}` : ''}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </SectionCard>

        <SectionCard badge="Registros" title="Registros" tone="primary">
          <div className="log mono">
            {logs.map((line, index) => (
              <div key={`${line.ts}-${index}`}>[{line.ts}] {line.level.toUpperCase()} {line.message}</div>
            ))}
          </div>
        </SectionCard>
      </section>
    </DashboardShell>
  );
}
