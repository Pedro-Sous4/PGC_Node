'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { DashboardShell } from '../components/dashboard-shell';
import {
  EmailSendResult,
  enviarEmails,
  getDashboardEnvio,
  getEmailReport,
  getEmailTemplate,
  listCredores,
  listGrupos,
  updateEmailTemplate,
} from '../../lib/api';
import { ActionButton, DataTable, MetricCard, SectionCard, StatusBadge } from '../components/ui';

export default function EnviarEmailsPage() {
  const [grupos, setGrupos] = useState<Array<{ id: string; nome: string }>>([]);
  const [credores, setCredores] = useState<Array<{ id: string; nome: string; numero_pgc?: string }>>([]);
  const [grupoId, setGrupoId] = useState('');
  const [numeroPgc, setNumeroPgc] = useState('');
  const [pgcOptions, setPgcOptions] = useState<string[]>([]);
  const [escopo, setEscopo] = useState<'todos' | 'credor' | 'empresa'>('todos');
  const [selectedCredorIds, setSelectedCredorIds] = useState<string[]>([]);
  const [credorSearch, setCredorSearch] = useState('');
  const [credorOptions, setCredorOptions] = useState<Array<{ id: string; nome: string }>>([]);
  const [isCredorLoading, setIsCredorLoading] = useState(false);
  const [mensagemPrincipal, setMensagemPrincipal] = useState('');
  const [textoMinimo, setTextoMinimo] = useState('');
  const [textoDescontos, setTextoDescontos] = useState('');
  const [report, setReport] = useState<any[]>([]);
  const [lastSend, setLastSend] = useState<EmailSendResult | null>(null);

  const statCardStyle = {
    borderRadius: 12,
    padding: '10px 12px',
    border: '1px solid var(--border)',
    background: 'rgba(255,255,255,0.75)',
  } as const;

  const sentStyle = {
    ...statCardStyle,
    borderColor: '#3d9a52',
    background: 'rgba(61,154,82,0.12)',
  };

  const failedStyle = {
    ...statCardStyle,
    borderColor: '#c44747',
    background: 'rgba(196,71,71,0.12)',
  };

  const pendingStyle = {
    ...statCardStyle,
    borderColor: '#c18a2a',
    background: 'rgba(193,138,42,0.15)',
  };

  const credorNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const credor of credores) {
      map.set(credor.id, credor.nome);
    }
    for (const credor of credorOptions) {
      map.set(credor.id, credor.nome);
    }
    return map;
  }, [credores, credorOptions]);

  useEffect(() => {
    void (async () => {
      const [gruposData, template] = await Promise.all([listGrupos(), getEmailTemplate()]);
      setGrupos(gruposData);
      setMensagemPrincipal(template.mensagem_principal);
      setTextoMinimo(template.texto_minimo);
      setTextoDescontos(template.texto_descontos);
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      const [credoresResp, dashboardResp] = await Promise.allSettled([
        listCredores({ grupoId, take: 500 }),
        getDashboardEnvio(grupoId || undefined),
      ]);

      const credoresData = credoresResp.status === 'fulfilled' ? credoresResp.value.data : [];
      setCredores(credoresData.map((item) => ({ id: item.id, nome: item.nome, numero_pgc: item.numero_pgc })));

      const pgcFromDashboard =
        dashboardResp.status === 'fulfilled'
          ? (dashboardResp.value?.por_pgc ?? []).map((row: { numero_pgc: string }) => String(row.numero_pgc ?? '').trim())
          : [];

      const pgcFromCredores = credoresData
        .map((item) => String(item.numero_pgc ?? '').trim())
        .filter(Boolean);

      const pgcs = Array.from(new Set([...pgcFromDashboard, ...pgcFromCredores])).sort((a: string, b: string) =>
        a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }),
      );
      setPgcOptions(pgcs);

      if (numeroPgc && !pgcs.includes(numeroPgc)) {
        setNumeroPgc('');
      }
    })();
  }, [grupoId]);

  useEffect(() => {
    if (escopo !== 'credor') return;

    let canceled = false;
    const timeout = setTimeout(() => {
      void (async () => {
        setIsCredorLoading(true);
        try {
          const result = await listCredores({
            grupoId: grupoId || undefined,
            nome: credorSearch.trim() || undefined,
            take: 80,
          });

          if (!canceled) {
            setCredorOptions(result.data.map((item) => ({ id: item.id, nome: item.nome })));
          }
        } finally {
          if (!canceled) {
            setIsCredorLoading(false);
          }
        }
      })();
    }, 250);

    return () => {
      canceled = true;
      clearTimeout(timeout);
    };
  }, [escopo, grupoId, credorSearch]);

  useEffect(() => {
    setSelectedCredorIds([]);
    setCredorSearch('');
    setCredorOptions([]);
  }, [grupoId]);

  async function handleSaveTemplate(event: FormEvent) {
    event.preventDefault();
    await updateEmailTemplate({
      mensagem_principal: mensagemPrincipal,
      texto_minimo: textoMinimo,
      texto_descontos: textoDescontos,
    });
  }

  async function handleSend(event: FormEvent) {
    event.preventDefault();
    const result = await enviarEmails({
      grupoId: grupoId || undefined,
      numero_pgc: numeroPgc,
      escopo,
      credorIds: escopo === 'credor' ? selectedCredorIds : undefined,
    });
    setLastSend(result);
    const rel = await getEmailReport(120);
    setReport(rel);
  }

  return (
    <DashboardShell
      activeNav="enviar-emails"
      title="Enviar E-mails"
      subtitle="Envio por grupo/PGC com modelo editável e relatório de tentativas"
    >
      <SectionCard badge="Disparo" title="Configurar envio" tone="primary">
        <form className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }} onSubmit={handleSend}>
          <label>
            Grupo
            <select value={grupoId} onChange={(e) => setGrupoId(e.target.value)}>
              <option value="">Todos</option>
              {grupos.map((g) => (
                <option key={g.id} value={g.id}>{g.nome}</option>
              ))}
            </select>
          </label>

          <label>
            Número PGC
            <select value={numeroPgc} onChange={(e) => setNumeroPgc(e.target.value)} required>
              <option value="">Selecione um PGC</option>
              {pgcOptions.map((pgc) => (
                <option key={pgc} value={pgc}>{pgc}</option>
              ))}
            </select>
          </label>

          <label>
            Escopo
            <select value={escopo} onChange={(e) => setEscopo(e.target.value as 'todos' | 'credor' | 'empresa')}>
              <option value="todos">Todos</option>
              <option value="credor">Por credor</option>
              <option value="empresa">Por empresa</option>
            </select>
          </label>

          <div style={{ display: 'flex', alignItems: 'end' }}>
            <ActionButton type="submit" label="Enviar e-mails" icon="->" />
          </div>
        </form>

        {escopo === 'credor' && (
          <div style={{ marginTop: 12 }}>
            <p>Selecionar subconjunto de credores:</p>
            <div style={{ display: 'grid', gap: 10 }}>
              <input
                type="text"
                value={credorSearch}
                onChange={(e) => setCredorSearch(e.target.value)}
                placeholder="Pesquisar credor por nome"
              />

              <div style={{ border: '1px solid var(--border)', borderRadius: 10, maxHeight: 240, overflowY: 'auto' }}>
                {isCredorLoading ? (
                  <div style={{ padding: 10 }}>Carregando...</div>
                ) : credorOptions.length === 0 ? (
                  <div style={{ padding: 10 }}>Nenhum credor encontrado para o filtro atual.</div>
                ) : (
                  credorOptions.map((credor) => {
                    const selected = selectedCredorIds.includes(credor.id);
                    return (
                      <button
                        key={credor.id}
                        type="button"
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          borderRadius: 0,
                          border: 'none',
                          borderBottom: '1px solid var(--border)',
                          padding: '8px 10px',
                          color: selected ? '#0f5a49' : '#1b3931',
                          fontWeight: selected ? 700 : 500,
                          background: selected ? 'rgba(61,154,82,0.18)' : 'rgba(255,255,255,0.72)',
                        }}
                        onClick={() => {
                          setSelectedCredorIds((prev) =>
                            prev.includes(credor.id) ? prev.filter((id) => id !== credor.id) : [...prev, credor.id],
                          );
                        }}
                      >
                        {selected ? '✓ ' : ''}
                        {credor.nome}
                      </button>
                    );
                  })
                )}
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <ActionButton type="button" variant="secondary" onClick={() => setSelectedCredorIds([])} label="Limpar seleção" />
              </div>

              <small>
                {selectedCredorIds.length} selecionado(s) de {credorOptions.length} listado(s) na busca atual.
              </small>

              {selectedCredorIds.length > 0 ? (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {selectedCredorIds.map((id) => (
                    <ActionButton
                      key={id}
                      type="button"
                      variant="secondary"
                      onClick={() => setSelectedCredorIds((prev) => prev.filter((x) => x !== id))}
                      label={`${credorNameById.get(id) ?? id} x`}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        )}
      </SectionCard>

      <SectionCard badge="Modelo" title="Modelo de mensagem" tone="accent" className="mt-16">
        <form onSubmit={handleSaveTemplate}>
          <label>
            Mensagem principal
            <textarea
              value={mensagemPrincipal}
              onChange={(e) => setMensagemPrincipal(e.target.value)}
              rows={10}
              style={{ minHeight: 220 }}
            />
          </label>
          <label>
            Texto de mínimo
            <textarea value={textoMinimo} onChange={(e) => setTextoMinimo(e.target.value)} rows={2} />
          </label>
          <label>
            Texto de descontos
            <textarea value={textoDescontos} onChange={(e) => setTextoDescontos(e.target.value)} rows={2} />
          </label>
          <div style={{ marginTop: 12 }}>
            <ActionButton type="submit" variant="secondary" label="Salvar modelo" />
          </div>
        </form>
      </SectionCard>

      <SectionCard badge="Consolidado" title="Resultado do último disparo" className="mt-16">

        {!lastSend ? (
          <p>Nenhum disparo nesta sessão ainda.</p>
        ) : (
          <>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', marginBottom: 12 }}>
              <MetricCard label="Total" value={lastSend.total_geral?.totalCredores ?? 0} />
              <MetricCard label="Enviados" value={lastSend.total_geral?.sent ?? lastSend.sent} tone="primary" />
              <MetricCard label="Falhas" value={lastSend.total_geral?.failed ?? lastSend.failed} tone="accent" />
              <MetricCard label="Pendentes" value={lastSend.total_geral?.pending ?? lastSend.pending} />
              <MetricCard label="Lotes" value={lastSend.total_geral?.quantidadeLotes ?? lastSend.lotes?.length ?? 0} />
              <MetricCard label="Tam. lote" value={lastSend.total_geral?.tamanhoLoteConfigurado ?? '-'} />
            </div>

            {(lastSend.lotes?.length ?? 0) > 0 ? (
              <DataTable>
                <thead>
                  <tr>
                    <th>Lote</th>
                    <th>Credores</th>
                    <th>Enviados</th>
                    <th>Falhas</th>
                    <th>Pendentes</th>
                  </tr>
                </thead>
                <tbody>
                  {lastSend.lotes?.map((lote) => (
                    <tr
                      key={lote.lote}
                      style={{
                        background:
                          lote.failed > 0
                            ? 'rgba(196,71,71,0.08)'
                            : lote.sent > 0
                              ? 'rgba(61,154,82,0.08)'
                              : 'rgba(193,138,42,0.10)',
                      }}
                    >
                      <td>{lote.lote}</td>
                      <td>{lote.totalCredores}</td>
                      <td><StatusBadge status={`Enviados: ${lote.sent}`} /></td>
                      <td><StatusBadge status={`Falhas: ${lote.failed}`} /></td>
                      <td><StatusBadge status={`Pendentes: ${lote.pending}`} /></td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            ) : null}
          </>
        )}
      </SectionCard>

      <SectionCard badge="Relatório" title="Relatório de envio" className="mt-16">
        <ul>
          {report.map((item) => {
            const status = String(item.status ?? '').toUpperCase();
            const isSuccess = status === 'SUCCESS' || status === 'SENT';
            const isError = status === 'ERROR' || status === 'FAILED';

            const rowStyle = isSuccess
              ? { background: 'rgba(61,154,82,0.10)', border: '1px solid rgba(61,154,82,0.35)' }
              : isError
                ? { background: 'rgba(196,71,71,0.10)', border: '1px solid rgba(196,71,71,0.35)' }
                : { background: 'rgba(193,138,42,0.12)', border: '1px solid rgba(193,138,42,0.35)' };

            return (
              <li key={item.id} style={{ ...rowStyle, borderRadius: 10, padding: '8px 10px', marginBottom: 8 }}>
                lote: {item.batch ?? '-'} | {item.credor?.nomeExibivel ?? '-'} - {item.status} - tentativas: {item.attempts ?? item.tentativas ?? 0}
                {item.error_message ? ` - erro: ${item.error_message}` : ''}
              </li>
            );
          })}
        </ul>
      </SectionCard>
    </DashboardShell>
  );
}
