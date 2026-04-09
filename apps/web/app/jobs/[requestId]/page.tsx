'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { getJobStatus, JobState, reprocessJob, streamJob } from '../../../lib/api';
import { DashboardShell } from '../../components/dashboard-shell';
import { ActionButton, SectionCard, StatusBadge } from '../../components/ui';

export default function JobPage({ params }: { params: { requestId: string } }) {
  const { requestId } = params;
  const [streamed, setStreamed] = useState<JobState | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const query = useQuery({
    queryKey: ['job', requestId],
    queryFn: () => getJobStatus(requestId),
    refetchInterval: 3000,
  });

  useEffect(() => {
    const source = streamJob(requestId, (state) => {
      setStreamed(state);
      setLogs((prev) => {
        const next = [`[${new Date().toISOString()}] ${state.stage} ${state.percent}%`, ...prev];
        return next.slice(0, 40);
      });
    });

    return () => source.close();
  }, [requestId]);

  const state = streamed ?? query.data;

  const errorCredores = useMemo(
    () => state?.credores.filter((item) => item.state === 'ERROR').map((item) => item.credorSlug) ?? [],
    [state],
  );

  if (!state) {
    return (
      <DashboardShell
        activeNav="jobs"
        title="Processamento"
        subtitle="Acompanhamento operacional em tempo real"
      >
        <div className="card">Carregando status do processamento...</div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell
      activeNav="jobs"
      title="Processamento"
      subtitle="Monitoramento de progresso, erros estruturados e reprocessamento"
    >
      <section className="grid two">
        <SectionCard badge="Processamento" title="Progresso da execução" tone="primary">
        <p className="mono">ID da solicitação: {state.requestId}</p>
        <p>
          <StatusBadge status={state.status} />
        </p>

        <div className="progress" aria-label="progresso">
          <div style={{ width: `${state.percent}%` }} />
        </div>

        <p>Etapa atual: <strong>{state.stage}</strong></p>
        <p>Status: <strong>{state.status}</strong></p>
        <p>Credor atual: <strong>{state.currentCredor ?? '-'}</strong></p>
        <p>Sucesso: <strong>{state.successCount}</strong> | Erro: <strong>{state.errorCount}</strong></p>

        <h3>Credores</h3>
        <ul>
          {state.credores.map((item) => (
            <li key={item.credorSlug}>
              <span className="mono">{item.credorName ?? item.credorSlug}</span> - {item.state}
            </li>
          ))}
        </ul>

        <ActionButton
          variant="secondary"
          disabled={errorCredores.length === 0}
          onClick={async () => {
            await reprocessJob(requestId, errorCredores);
          }}
          label="Reprocessar credores com erro"
        />
        </SectionCard>

        <div className="grid">
          <SectionCard badge="Erros" title="Erros estruturados" tone="accent">
          <ul>
            {state.errors.length === 0 && <li>Sem erros no momento.</li>}
            {state.errors.map((err, index) => (
              <li key={`${err.code}-${index}`}>
                <span className="mono">{err.credorSlug ?? 'global'}</span> - {err.code}: {err.message}
              </li>
            ))}
          </ul>
          </SectionCard>

          <SectionCard badge="Registros" title="Registros em tempo real" tone="primary">
          <div className="log mono">
            {logs.map((line, index) => (
              <div key={`${line}-${index}`}>{line}</div>
            ))}
          </div>
          </SectionCard>
        </div>
      </section>
    </DashboardShell>
  );
}
