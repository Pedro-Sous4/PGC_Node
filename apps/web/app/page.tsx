'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCheck,
  Download,
  Files,
  Mail,
  Upload,
  Users,
} from 'lucide-react';
import { getDashboardEnvio, listCredores } from '../lib/api';
import { DashboardShell } from './components/dashboard-shell';
import { ActionButton, DataTable, SectionCard, StatusBadge } from './components/ui';

export default function HomePage() {
  const credoresQuery = useQuery({
    queryKey: ['home-credores-dashboard'],
    queryFn: () => listCredores({ skip: 0, take: 200 }),
  });

  const envioQuery = useQuery({
    queryKey: ['home-envio-dashboard'],
    queryFn: () => getDashboardEnvio(),
  });

  const rows = credoresQuery.data?.data ?? [];
  const totalCredores = credoresQuery.data?.page?.total ?? rows.length;
  const enviados = envioQuery.data?.totais?.enviados ?? rows.filter((row) => row.enviado).length;
  const naoEnviados = envioQuery.data?.totais?.nao_enviados ?? Math.max(totalCredores - enviados, 0);
  const processados = Math.max(enviados + naoEnviados, totalCredores);
  const arquivosGerados = processados;
  const percEmails = processados > 0 ? Math.round((enviados / processados) * 100) : 0;

  const semEmail = rows.filter((row) => !row.email).length;
  const recentes = useMemo(() => {
    return (envioQuery.data?.por_pgc ?? [])
      .map((item: { numero_pgc: string; total: number }) => ({
        pgc: item.numero_pgc,
        credores: item.total,
        enviados: 0, // Campo simplificado, mantido apenas para tipos se necessário
      }))
      .slice(0, 5);
  }, [envioQuery.data]);

  const isDataLoaded = totalCredores > 0;
  const pipelineProgress = isDataLoaded ? Math.round(50 + (percEmails / 100) * 50) : 0;

  return (
    <DashboardShell
      activeNav="dashboard"
      title="Dashboard"
      subtitle="Painel de gestão de rendimentos PGC"
      topActionLabel="Novo Processamento"
      onTopActionClick={() => {
        window.location.href = '/lgm';
      }}
    >
      <section className="ops-kpi-grid">
        <article className="ops-stat-card">
          <div className="ops-stat-top">
            <span>Credores</span>
            <i aria-hidden="true"><Users size={14} strokeWidth={2} /></i>
          </div>
          <strong>{totalCredores}</strong>
          <small>Total de credores cadastrados</small>
        </article>

        <article className="ops-stat-card">
          <div className="ops-stat-top">
            <span>Processadas</span>
            <i aria-hidden="true"><CheckCheck size={14} strokeWidth={2} /></i>
          </div>
          <strong>{processados}</strong>
          <div className="ops-stat-progress">
            <div style={{ width: `${percEmails}%` }} />
          </div>
          <small>{percEmails}% do ciclo</small>
        </article>

        <article className="ops-stat-card">
          <div className="ops-stat-top">
            <span>Arquivos</span>
            <i aria-hidden="true"><Files size={14} strokeWidth={2} /></i>
          </div>
          <strong>{arquivosGerados}</strong>
          <small>Gerados para download</small>
        </article>

        <article className="ops-stat-card is-accent">
          <div className="ops-stat-top">
            <span>E-mails Enviados</span>
            <i aria-hidden="true"><Mail size={14} strokeWidth={2} /></i>
          </div>
          <strong>{enviados}</strong>
          <div className="ops-stat-progress accent">
            <div style={{ width: `${percEmails}%` }} />
          </div>
          <small>{Math.max(100 - percEmails, 0)}% pendente</small>
        </article>
      </section>

      <section className="ops-layout">
        <div className="ops-main-stack">
          <SectionCard
            badge="PGC Atual"
            title={`PGC Atual: ${recentes[0]?.pgc ?? '-'}`}
            subtitle="Fluxo operacional do ciclo atual"
            tone="primary"
          >
            <div className="ops-pipeline-status">
              <StatusBadge status={percEmails === 100 ? 'Concluido' : 'Em andamento'} />
              <span>{Math.max(totalCredores - enviados, 0)} credores restantes</span>
            </div>
            <div className="ops-pipeline">
              <article className={`ops-stage ${isDataLoaded ? 'done' : 'pending'}`}>
                <span className="ops-stage-icon"><Upload size={13} strokeWidth={2} /></span>
                <strong>Importacao</strong>
                <small>{isDataLoaded ? 'Concluida' : 'Pendente'}</small>
              </article>
              <article className={`ops-stage ${isDataLoaded ? 'done' : 'pending'}`}>
                <span className="ops-stage-icon"><CheckCheck size={13} strokeWidth={2} /></span>
                <strong>Processamento</strong>
                <small>{isDataLoaded ? 'Concluido' : 'Pendente'}</small>
              </article>
              <article className={`ops-stage ${isDataLoaded ? 'done' : 'pending'}`}>
                <span className="ops-stage-icon"><Download size={13} strokeWidth={2} /></span>
                <strong>Arquivos</strong>
                <small>{isDataLoaded ? 'Gerados' : 'Pendente'}</small>
              </article>
              <article className={`ops-stage ${isDataLoaded && percEmails === 100 ? 'done' : isDataLoaded ? 'running' : 'pending'}`}>
                <span className="ops-stage-icon"><Mail size={13} strokeWidth={2} /></span>
                <strong>E-mails</strong>
                <small>{isDataLoaded ? (percEmails === 100 ? 'Concluido' : 'Em envio') : 'Pendente'}</small>
              </article>
            </div>

            <div className="progress" aria-label="progresso do pipeline" style={{ marginTop: 12 }}>
              <div style={{ width: `${pipelineProgress}%` }} />
            </div>
            <p className="muted" style={{ marginBottom: 0 }}>
              {pipelineProgress}% concluido - faltam {Math.max(totalCredores - enviados, 0)} credores para envio total.
            </p>
          </SectionCard>

          <SectionCard badge="Historico" title="Processamentos recentes" subtitle="Ultimos PGCs com volume e status" className="mt-16">
            <DataTable>
              <thead>
                <tr>
                  <th>PGC</th>
                  <th>Credores</th>
                  <th>Status</th>
                  <th>Acoes</th>
                </tr>
              </thead>
              <tbody>
                {recentes.map((item, index) => {
                  const concluido = item.credores > 0 && item.enviados >= item.credores;
                  return (
                    <tr key={`${item.pgc}-${index}`}>
                      <td>{item.pgc}</td>
                      <td>{item.credores}</td>
                      <td>
                        <StatusBadge status={concluido ? 'Concluido' : 'Em andamento'} />
                      </td>
                      <td>
                        <Link href="/credores" className="link-action">Ver</Link>
                      </td>
                    </tr>
                  );
                })}
                {recentes.length === 0 ? (
                  <tr>
                    <td colSpan={4}>Sem processamentos recentes para exibir.</td>
                  </tr>
                ) : null}
              </tbody>
            </DataTable>
          </SectionCard>

          <SectionCard badge="Atencao" title="Alertas" subtitle="Itens que exigem revisao" className="mt-16" tone="accent">
            <ul className="ops-alert-list">
              <li className="warn">
                <span className="alert-dot" aria-hidden="true"><AlertTriangle size={12} strokeWidth={2.2} /></span>
                <strong>{semEmail}</strong> credores sem e-mail cadastrado.
                <Link href="/credores"> Revisar</Link>
              </li>
              <li className="warn">
                <span className="alert-dot" aria-hidden="true"><AlertTriangle size={12} strokeWidth={2.2} /></span>
                <strong>{naoEnviados}</strong> credores ainda nao enviados.
                <Link href="/enviar-emails"> Enviar agora</Link>
              </li>
            </ul>
          </SectionCard>
        </div>

        <aside className="ops-side-stack">
          <SectionCard badge="Atalhos" title="Acoes rapidas" tone="primary">
            <div className="ops-quick-actions">
              <ActionButton label="Iniciar LGM" icon=">" onClick={() => { window.location.href = '/lgm'; }} />
              <ActionButton label="Iniciar Sports" icon=">" variant="secondary" onClick={() => { window.location.href = '/laghetto-sports'; }} />
              <ActionButton label="Importar Credores" icon=">" variant="secondary" onClick={() => { window.location.href = '/upload-emails'; }} />
              <ActionButton label="Gerar Arquivos" icon=">" variant="secondary" onClick={() => { window.location.href = '/lgm'; }} />
              <ActionButton label="Enviar E-mails" icon=">" variant="secondary" onClick={() => { window.location.href = '/enviar-emails'; }} />
            </div>
          </SectionCard>

          <SectionCard badge="Timeline" title="Atividade do sistema" className="mt-16">
            <ul className="ops-activity-list">
              <li>
                <span>14:26</span>
                <strong>E-mails sendo enviados</strong>
              </li>
              <li>
                <span>14:24</span>
                <strong>Arquivos gerados com sucesso</strong>
              </li>
              <li>
                <span>14:22</span>
                <strong>Processamento concluido</strong>
              </li>
              <li>
                <span>14:21</span>
                <strong>Importacao finalizada</strong>
              </li>
            </ul>
          </SectionCard>
        </aside>
      </section>
    </DashboardShell>
  );
}
