'use client';

import { useQuery } from '@tanstack/react-query';
import { DashboardShell } from '../components/dashboard-shell';
import { getDashboardEnvio, listGrupos } from '../../lib/api';
import { useState } from 'react';
import { ChartCard, MetricCard, SectionCard } from '../components/ui';

export default function DashboardEnvioPage() {
  const [grupoId, setGrupoId] = useState('');

  const gruposQuery = useQuery({ queryKey: ['grupos'], queryFn: listGrupos });
  const dashboardQuery = useQuery({
    queryKey: ['dashboard-envio', grupoId],
    queryFn: () => getDashboardEnvio(grupoId || undefined),
  });

  const data = dashboardQuery.data;

  return (
    <DashboardShell
      activeNav="dashboard"
      title="Painel de envio"
      subtitle="Totais enviados x não enviados com distribuição por PGC e filtros por grupo"
    >
      <SectionCard badge="Filtros" title="Visão de grupo" tone="primary">
        <label>
          Grupo
          <select value={grupoId} onChange={(e) => setGrupoId(e.target.value)}>
            <option value="">Todos</option>
            {(gruposQuery.data ?? []).map((g) => (
              <option key={g.id} value={g.id}>{g.nome}</option>
            ))}
          </select>
        </label>
      </SectionCard>

      <section className="grid ui-metric-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginTop: 16 }}>
        <MetricCard label="Credores enviados" value={data?.totais?.enviados ?? 0} hint="Status com entrega confirmada" tone="primary" />
        <MetricCard label="Credores pendentes" value={data?.totais?.nao_enviados ?? 0} hint="Ainda sem disparo" tone="accent" />
      </section>

      <ChartCard badge="PGC" title="Distribuição por número PGC" subtitle="Volume de credores por grupo PGC">
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
          {(data?.por_pgc ?? []).map((row: { numero_pgc: string; total: number }) => (
            <div key={row.numero_pgc} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12, background: 'rgba(255,255,255,0.7)' }}>
              <strong>{row.numero_pgc}</strong>
              <div className="progress" style={{ marginTop: 8 }}>
                <div style={{ width: `${Math.min(row.total * 10, 100)}%` }} />
              </div>
              <small className="muted">{row.total} credores</small>
            </div>
          ))}
        </div>
      </ChartCard>

      <section className="grid two" style={{ marginTop: 16 }}>
        <SectionCard badge="Top 20" title="Credores enviados" tone="primary">
          <ul>
            {(data?.enviados ?? []).slice(0, 20).map((c: { id: string; nome: string }) => (
              <li key={c.id}>{c.nome}</li>
            ))}
          </ul>
        </SectionCard>
        <SectionCard badge="Top 20" title="Credores não enviados" tone="accent">
          <ul>
            {(data?.nao_enviados ?? []).slice(0, 20).map((c: { id: string; nome: string }) => (
              <li key={c.id}>{c.nome}</li>
            ))}
          </ul>
        </SectionCard>
      </section>
    </DashboardShell>
  );
}
