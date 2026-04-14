'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { DashboardShell } from '../components/dashboard-shell';
import { getJobStatus, lgmCredores, lgmDownload, lgmErrors, lgmLogs, lgmResolveError, lgmUpload } from '../../lib/api';
import { ActionButton, SectionCard, StatusBadge } from '../components/ui';

type LgmError = {
  id: string;
  credorSlug?: string;
  code: string;
  message: string;
  resolutionAction?: string | null;
  resolutionNote?: string | null;
  resolvedAt?: string | null;
  ignoredAt?: string | null;
};

function stageLabel(stage?: string): string {
  switch (stage) {
    case 'UPLOAD_RECEIVED':
      return 'Upload recebido';
    case 'INGESTION':
      return 'Leitura de dados';
    case 'MINIMO':
      return 'Calculo de minimo';
    case 'DESCONTOS':
      return 'Calculo de descontos';
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

export default function LgmPage() {
  const [file, setFile] = useState<File | null>(null);
  const [credoresCsv, setCredoresCsv] = useState('');
  const [requestId, setRequestId] = useState('');
  const [status, setStatus] = useState<any>(null);
  const [errors, setErrors] = useState<LgmError[]>([]);
  const [credores, setCredores] = useState<any[]>([]);
  const [logs, setLogs] = useState<any>(null);
  const [selectedError, setSelectedError] = useState<LgmError | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const processingCredores = useMemo(
    () =>
      credores.filter(
        (item) => String(item.status ?? '').toUpperCase() === 'PROCESSING',
      ),
    [credores],
  );

  const processedCredores = useMemo(
    () =>
      credores
        .filter((item) => {
          const state = String(item.status ?? '').toUpperCase();
          return state === 'SUCCESS' || state === 'ERROR';
        })
        .sort((a, b) =>
          String(a.nome ?? a.credorName ?? a.credorSlug ?? '').localeCompare(
            String(b.nome ?? b.credorName ?? b.credorSlug ?? ''),
            'pt-BR',
            { sensitivity: 'base' },
          ),
        ),
    [credores],
  );

  const alertCredores = useMemo(
    () =>
      processedCredores.filter((item) =>
        String(item.message ?? '').toLowerCase().includes('produtividade'),
      ),
    [processedCredores],
  );

  const carregar = useCallback(async () => {
    if (!requestId.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const [s, e, c, l] = await Promise.all([
        getJobStatus(requestId),
        lgmErrors(requestId),
        lgmCredores(requestId),
        lgmLogs(requestId),
      ]);
      setStatus(s);
      setErrors(e);
      setCredores(c);
      setLogs(l);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [requestId]);

  useEffect(() => {
    if (!requestId || !autoRefresh) return;
    const done = status?.stage === 'FINISHED' || status?.status === 'SUCCESS' || status?.status === 'ERROR';
    if (done) return;

    const id = setInterval(() => {
      void carregar();
    }, 1800);

    return () => clearInterval(id);
  }, [requestId, autoRefresh, status?.stage, status?.status, carregar]);

  async function handleUpload(event: FormEvent) {
    event.preventDefault();
    if (!file) return;
    setError(null);

    try {
      const response = await lgmUpload(file, credoresCsv);
      setRequestId(response.request_id);
      setAutoRefresh(true);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    if (!requestId) return;
    void carregar();
  }, [requestId, carregar]);

  async function resolver(action: 'resolve' | 'ignore') {
    if (!selectedError) return;
    await lgmResolveError(requestId, selectedError.id, { action, note: note || undefined });
    setSelectedError(null);
    setNote('');
    await carregar();
  }

  async function downloadZip() {
    if (!requestId.trim()) return;
    setError(null);
    try {
      const data = await lgmDownload(requestId.trim());
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
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <DashboardShell
      activeNav="lgm"
      title="Laghetto Golden (LGM)"
      subtitle="Upload, monitoramento em tempo real e resolução de erros por credor"
    >
      <form onSubmit={handleUpload}>
        <SectionCard badge="Upload" title="Processamento LGM" tone="primary">
          <label>
            Arquivo
            <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required />
          </label>
          <label>
            Credores (opcional, separados por vírgula)
            <input value={credoresCsv} onChange={(e) => setCredoresCsv(e.target.value)} />
          </label>

          <div className="actions-row" style={{ marginTop: 12 }}>
            <ActionButton type="submit" label="Iniciar processamento LGM" icon="->" />
          </div>

          {requestId ? <p className="mono">ID da solicitação: {requestId}</p> : null}
          {status ? (
            <p>
              Status: <StatusBadge status={String(status.status)} /> | Etapa: {String(status.stage)} | Progresso: {status.percent}%
            </p>
          ) : null}
          {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
        </SectionCard>
      </form>

      <section className="grid two" style={{ marginTop: 16 }}>
        <SectionCard badge="Execução" title="Status da execução" tone="accent">
          {!status && <p>Sem dados ainda.</p>}
          {status && (
            <>
              <p>Status: <StatusBadge status={String(status.status)} /></p>
              <p>Etapa: {stageLabel(String(status.stage))}</p>
              <p>Progresso: {Number(status.percent ?? 0)}%</p>
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
              <p>Sucesso: {Number(status.successCount ?? 0)} | Erro: {Number(status.errorCount ?? 0)}</p>
              {String(status.status ?? '').toUpperCase() === 'PROCESSING' && (
                <>
                  <h4 style={{ marginBottom: 8 }}>Credores em processamento</h4>
                  {processingCredores.length === 0 && <p>Nenhum credor em processamento no momento.</p>}
                  {processingCredores.length > 0 && (
                    <ul style={{ marginTop: 0 }}>
                      {processingCredores.map((item) => (
                        <li key={String(item.credorSlug)}>
                          {String(item.nome ?? item.credorName ?? item.credorSlug)}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </>
          )}
        </SectionCard>

        <SectionCard badge="Erros" title="Erros estruturados" tone="accent">
          <ul>
            {errors.map((item) => (
              <li key={item.id}>
                <button className="secondary" onClick={() => setSelectedError(item)} type="button">
                  {item.credorSlug ?? 'global'} - {item.code}: {item.message}
                  {item.resolutionAction ? ` [${item.resolutionAction}]` : ''}
                </button>
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard badge="Credores" title="Credores processados" tone="primary">
          <ul>
            {processedCredores.map((c) => (
              <li key={`${c.credorSlug}-${c.stage}`}>
                {c.nome} ({c.credorSlug}) - <StatusBadge status={String(c.status)} />
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard
          badge="Alerta"
          title={`Credores com alerta (${alertCredores.length})`}
          tone="accent"
        >
          {alertCredores.length === 0 && <p>Nenhum alerta no processamento atual.</p>}
          {alertCredores.length > 0 && (
            <ul>
              {alertCredores.map((c) => (
                <li key={`alert-${c.credorSlug}`}>
                  {String(c.nome ?? c.credorName ?? c.credorSlug)} - {String(c.message ?? 'Alerta sem detalhe')}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </section>

      <SectionCard badge="Registros" title="Logs e resumo visual" className="mt-16">
        <div className="log mono">
          {(logs?.steps ?? []).map((s: any) => (
            <div key={s.id}>ETAPA {s.name} - {s.status}</div>
          ))}
          {(logs?.errors ?? []).map((e: any) => (
            <div key={e.id}>ERRO {e.credorSlug ?? 'global'} - {e.code}: {e.message}</div>
          ))}
        </div>
      </SectionCard>

      {selectedError && (
        <SectionCard badge="Ação" title="Resolver erro" tone="accent" className="mt-16">
          <p><strong>{selectedError.code}</strong> - {selectedError.message}</p>
          <label>
            Observação
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
          </label>
          <div className="actions-row" style={{ marginTop: 12 }}>
            <ActionButton onClick={() => resolver('resolve')} label="Marcar como resolvido" />
            <ActionButton variant="secondary" onClick={() => resolver('ignore')} label="Ignorar erro" />
            <ActionButton variant="ghost" onClick={() => setSelectedError(null)} label="Fechar" />
          </div>
        </SectionCard>
      )}
    </DashboardShell>
  );
}
