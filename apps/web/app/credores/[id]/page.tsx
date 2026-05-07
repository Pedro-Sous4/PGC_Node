'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DashboardShell } from '../../components/dashboard-shell';
import {
  EmailTemplate,
  enviarEmails,
  exportCredorPdfUrl,
  getCredor,
  getEmailTemplate,
  openCredorFolder,
} from '../../../lib/api';
import { ActionButton, AvatarBadge, ChartCard, DataTable, MetricCard, SectionCard } from '../../components/ui';

function resolvePeriodoByGroupRule(grupoNome: string | undefined, numeroPgc: string | null | undefined): string {
  const pgcNum = Number(String(numeroPgc ?? '').replace(/\D/g, ''));
  if (!Number.isFinite(pgcNum)) return '-';

  const normalizedGroup = String(grupoNome ?? '').toUpperCase();
  const baseByGroup: Record<string, number> = {
    SPORTS: 13,
    LGM: 32,
  };

  const basePgc = baseByGroup[normalizedGroup];
  if (!basePgc) return '-';

  const delta = pgcNum - basePgc;
  const baseYear = 2025;
  const baseMonthIndex = 10; // 11/2025 (zero-based)
  const monthIndex = baseMonthIndex + delta;
  const year = baseYear + Math.floor(monthIndex / 12);
  const month = ((monthIndex % 12 + 12) % 12) + 1;

  return `${String(month).padStart(2, '0')}/${year}`;
}

function toCurrency(value: number): string {
  return Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

function compactLabel(periodo: string, numeroPgc: string | null | undefined): string {
  return `PGC ${numeroPgc ?? '-'} | ${periodo}`;
}

function formatPeriodo(periodo: string): string {
  const [m, y] = String(periodo).split('/');
  const month = Number(m);
  const year = Number(y);
  if (!Number.isFinite(month) || !Number.isFinite(year) || month < 1 || month > 12) {
    return periodo;
  }
  const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return `${monthNames[month - 1]}/${year}`;
}

function parsePeriodoToSortKey(periodo: string): number {
  const [m, y] = String(periodo).split('/');
  const month = Number(m);
  const year = Number(y);
  if (!Number.isFinite(month) || !Number.isFinite(year)) return 0;
  return year * 12 + month;
}

function parsePgcToSortKey(numeroPgc: string): number {
  const value = Number(String(numeroPgc ?? '').replace(/\D/g, ''));
  return Number.isFinite(value) ? value : 0;
}

type DiscountHistoryRow = {
  id: string;
  pgc: string;
  empresa: string;
  desconto_total: number;
  desconto_aplicado: number;
  restante_proximo_pgc: number;
  desconto_acumulado: number;
  carryover_anterior: number;
};

type MinimoHistoryRow = {
  id: string;
  pgc: string;
  empresa: string;
  valor_minimo: number;
  valor_bruto: number;
  valor_total: number;
};

export default function CredorDetailPage({ params }: { params: { id: string } }) {
  const [openFolderMessage, setOpenFolderMessage] = useState('');
  const [periodFilter, setPeriodFilter] = useState('all');
  const [discountPgcFilter, setDiscountPgcFilter] = useState('all');
  const [discountEmpresaFilter, setDiscountEmpresaFilter] = useState('all');

  const [minimoPgcFilter, setMinimoPgcFilter] = useState('all');
  const [minimoEmpresaFilter, setMinimoEmpresaFilter] = useState('all');

  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [emailModalLoading, setEmailModalLoading] = useState(false);
  const [emailModalSaving, setEmailModalSaving] = useState(false);
  const [emailModalMessage, setEmailModalMessage] = useState('');
  const [emailTemplateDraft, setEmailTemplateDraft] = useState({
    mensagem_principal: '',
    texto_minimo: '',
    texto_descontos: '',
  });

  const query = useQuery({
    queryKey: ['credor', params.id],
    queryFn: () => getCredor(params.id),
  });

  const credor = query.data;

  const historicoRows = useMemo(() => {
    if (!credor) return [] as Array<{ id: string; numeroPgc: string; periodo: string; evento: string }>;

    // Deduplicação: Agrupa por número de PGC e mantém apenas um registro por PGC
    const uniqueMap = new Map<string, any>();

    (credor.historicos ?? []).forEach((h: any) => {
      const numeroPgc = String(h.numero_pgc ?? '-');
      const periodoByRule = resolvePeriodoByGroupRule(credor.grupo?.nome, h.numero_pgc);
      const periodo = periodoByRule !== '-' ? periodoByRule : String(h.periodo ?? '-');

      // Sempre sobrescreve com o último encontrado (que no array original costuma ser o mais recente dependendo da query)
      uniqueMap.set(numeroPgc, {
        id: String(h.id),
        numeroPgc,
        periodo,
        evento: String(h.evento ?? '-'),
      });
    });

    return Array.from(uniqueMap.values())
      .sort((a, b) => parsePeriodoToSortKey(b.periodo) - parsePeriodoToSortKey(a.periodo));
  }, [credor]);

  const periodOptions = useMemo<string[]>(() => {
    const values = Array.from(new Set(historicoRows.map((h: { periodo: string }) => h.periodo))) as string[];
    values.sort((a, b) => parsePeriodoToSortKey(b) - parsePeriodoToSortKey(a));
    return values;
  }, [historicoRows]);

  const filteredHistoricoRows = useMemo(() => {
    if (periodFilter === 'all') return historicoRows;
    return historicoRows.filter((h: { periodo: string }) => h.periodo === periodFilter);
  }, [historicoRows, periodFilter]);

  const descontoHistoricoRows = useMemo(() => {
    if (!credor) {
      return [] as DiscountHistoryRow[];
    }

    return ((credor.descontos_historico ?? []) as any[])
      .map((row: any) => ({
        id: String(row.id ?? `${row.pgc ?? '-'}-${row.empresa ?? '-'}`),
        pgc: String(row.pgc ?? '-'),
        empresa: String(row.empresa ?? '-'),
        desconto_total: Number(row.desconto_total ?? 0),
        desconto_aplicado: Number(row.desconto_aplicado ?? 0),
        restante_proximo_pgc: Number(row.restante_proximo_pgc ?? 0),
        desconto_acumulado: Number(row.desconto_acumulado ?? 0),
        carryover_anterior: Number(row.carryover_anterior ?? 0),
      }) as DiscountHistoryRow)
      .sort((a: DiscountHistoryRow, b: DiscountHistoryRow) => parsePgcToSortKey(b.pgc) - parsePgcToSortKey(a.pgc));
  }, [credor]);

  const discountPgcOptions = useMemo<string[]>(() => {
    const values = Array.from(new Set(descontoHistoricoRows.map((row) => row.pgc)));
    values.sort((a, b) => parsePgcToSortKey(b) - parsePgcToSortKey(a));
    return values;
  }, [descontoHistoricoRows]);

  const discountEmpresaOptions = useMemo<string[]>(() => {
    const values = Array.from(new Set(descontoHistoricoRows.map((row) => row.empresa)));
    values.sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
    return values;
  }, [descontoHistoricoRows]);

  const filteredDescontoHistoricoRows = useMemo(() => {
    return descontoHistoricoRows.filter((row) => {
      const matchPgc = discountPgcFilter === 'all' || row.pgc === discountPgcFilter;
      const matchEmpresa = discountEmpresaFilter === 'all' || row.empresa === discountEmpresaFilter;
      return matchPgc && matchEmpresa;
    });
  }, [descontoHistoricoRows, discountPgcFilter, discountEmpresaFilter]);

  const minimoHistoricoRows = useMemo(() => {
    if (!credor) return [] as MinimoHistoryRow[];
    return ((credor.minimosHistorico ?? []) as any[]).map((row: any) => ({
      id: String(row.id),
      pgc: String(row.numero_pgc ?? '-'),
      empresa: String(row.empresa ?? '-'),
      valor_minimo: Number(row.valor_minimo ?? 0),
      valor_bruto: Number(row.valor_bruto ?? 0),
      valor_total: Number(row.valor_total ?? 0),
    })).sort((a, b) => parsePgcToSortKey(b.pgc) - parsePgcToSortKey(a.pgc));
  }, [credor]);

  const minimoPgcOptions = useMemo<string[]>(() => {
    const values = Array.from(new Set(minimoHistoricoRows.map((row) => row.pgc)));
    values.sort((a, b) => parsePgcToSortKey(b) - parsePgcToSortKey(a));
    return values;
  }, [minimoHistoricoRows]);

  const minimoEmpresaOptions = useMemo<string[]>(() => {
    const values = Array.from(new Set(minimoHistoricoRows.map((row) => row.empresa)));
    values.sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
    return values;
  }, [minimoHistoricoRows]);

  const filteredMinimoHistoricoRows = useMemo(() => {
    return minimoHistoricoRows.filter((row) => {
      const matchPgc = minimoPgcFilter === 'all' || row.pgc === minimoPgcFilter;
      const matchEmpresa = minimoEmpresaFilter === 'all' || row.empresa === minimoEmpresaFilter;
      return matchPgc && matchEmpresa;
    });
  }, [minimoHistoricoRows, minimoPgcFilter, minimoEmpresaFilter]);

  const chartData = useMemo(() => {
    if (!credor) return [] as Array<{ x: string; y: number }>;

    // Deduplicação de rendimentos para o gráfico
    const uniqueMap = new Map<string, { x: string; y: number }>();

    (credor.rendimentos ?? []).forEach((r: any) => {
      const numeroPgc = String(r.numero_pgc ?? '-');
      const periodoRegra = resolvePeriodoByGroupRule(credor.grupo?.nome, r.numero_pgc);
      const periodoFinal = periodoRegra !== '-' ? periodoRegra : String(r.referencia ?? '-');
      const label = compactLabel(periodoFinal, numeroPgc);

      uniqueMap.set(label, {
        x: label,
        y: Number(r.valor ?? 0),
      });
    });

    const rows = Array.from(uniqueMap.values());
    // Ordena por período (menor para maior para o gráfico)
    return rows.sort((a, b) => {
      const pA = a.x.split('|')[1]?.trim() || '';
      const pB = b.x.split('|')[1]?.trim() || '';
      return parsePeriodoToSortKey(pA) - parsePeriodoToSortKey(pB);
    });
  }, [credor]);

  const averageValue = useMemo(() => {
    if (!credor) return 0;
    const count = Number(credor.resumo.quantidade_periodos) || 0;
    const total = Number(credor.resumo.total) || 0;
    if (count <= 0) return 0;
    return total / count;
  }, [credor]);

  const chartScale = useMemo(() => {
    const max = Math.max(1, ...chartData.map((d: { x: string; y: number }) => d.y));
    return { max };
  }, [chartData]);

  async function handleOpenFolder(numeroPgc?: string) {
    if (!credor?.id) return;
    setOpenFolderMessage('');
    try {
      const result = await openCredorFolder(credor.id, numeroPgc);
      if (result.opened) {
        setOpenFolderMessage('Pasta aberta no servidor.');
        return;
      }
      setOpenFolderMessage(result.message ?? 'Pasta não encontrada.');
    } catch (error) {
      setOpenFolderMessage((error as Error).message);
    }
  }

  function handleDownloadExtrato() {
    if (!credor?.id) return;
    window.location.href = exportCredorPdfUrl(credor.id);
  }

  async function handleOpenEmailModal() {
    setEmailModalMessage('');
    setIsEmailModalOpen(true);
    setEmailModalLoading(true);
    try {
      const template = await getEmailTemplate();
      const isSports = String(credor?.grupo?.nome ?? '').toUpperCase() === 'SPORTS';
      const msgDefault = isSports ? template.mensagem_laghetto_sports : template.mensagem_laghetto_golden;

      setEmailTemplateDraft({
        mensagem_principal: msgDefault,
        texto_minimo: template.texto_minimo,
        texto_descontos: template.texto_descontos,
      });
    } catch (error) {
      setEmailModalMessage((error as Error).message);
    } finally {
      setEmailModalLoading(false);
    }
  }

  async function handleSendFromModal() {
    if (!credor?.id) return;

    const latestPgc = String(historicoRows[0]?.numeroPgc ?? '').trim();
    if (!latestPgc || latestPgc === '-') {
      setEmailModalMessage('Não foi possível identificar o PGC deste credor para envio.');
      return;
    }

    setEmailModalSaving(true);
    setEmailModalMessage('');
    try {
      const result = await enviarEmails({
        escopo: 'credor',
        credorIds: [credor.id],
        numero_pgc: latestPgc,
        custom_mensagem_principal: emailTemplateDraft.mensagem_principal,
        custom_texto_minimo: emailTemplateDraft.texto_minimo,
        custom_texto_descontos: emailTemplateDraft.texto_descontos,
      });

      const sent = result.total_geral?.sent ?? result.sent ?? 0;
      const failed = result.total_geral?.failed ?? result.failed ?? 0;
      setEmailModalMessage(`Envio concluído. Enviados: ${sent}. Falhas: ${failed}.`);
    } catch (error) {
      setEmailModalMessage((error as Error).message);
    } finally {
      setEmailModalSaving(false);
    }
  }

  return (
    <DashboardShell
      activeNav="credores"
      title="Detalhe de Credor"
      subtitle="Histórico PGC, rendimentos e resumo por período"
    >
      {!credor && <div className="card">Carregando...</div>}

      {credor && (
        <>
          <SectionCard tone="neutral" className="credor-hero-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', width: '100%' }}>
              <AvatarBadge name={credor.nomeExibivel} tone="green" />
              <div>
                <h2 style={{ margin: 0 }}>{credor.nomeExibivel}</h2>
                <p style={{ margin: '4px 0 0' }}>{credor.email ?? '-'}</p>
              </div>
              <span className="status-pill neutral">{credor.grupo?.nome ?? '-'}</span>
              <div className="credor-hero-actions">
                <ActionButton
                  type="button"
                  variant="secondary"
                  label="Enviar e-mail"
                  onClick={handleOpenEmailModal}
                />
                <ActionButton type="button" variant="secondary" label="Baixar extrato" onClick={handleDownloadExtrato} />
              </div>
            </div>
          </SectionCard>

          <section className="grid ui-metric-grid" style={{ marginTop: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            <MetricCard label="Total recebido" value={`R$ ${toCurrency(Number(credor.resumo.total))}`} tone="primary" />
            <MetricCard label="Períodos" value={credor.resumo.quantidade_periodos} />
            <MetricCard
              label="Último PGC"
              value={historicoRows.length > 0 ? `PGC ${historicoRows[0].numeroPgc}` : '-'}
              tone="accent"
            />
            <MetricCard label="Média por período" value={`R$ ${toCurrency(averageValue)}`} />
            <MetricCard
              label="Saldo devedor"
              value={`R$ ${toCurrency(Number(credor.resumo.saldo_devedor ?? 0))}`}
              tone={Number(credor.resumo.saldo_devedor ?? 0) > 0 ? 'danger' : 'neutral'}
            />
          </section>

          <section className="grid" style={{ marginTop: 16, gridTemplateColumns: '1.65fr 1fr' }}>
            <SectionCard
              badge="Histórico"
              title="Histórico PGC"
              tone="accent"
              actions={
                <select value={periodFilter} onChange={(e) => setPeriodFilter(e.target.value)} style={{ width: 180 }}>
                  <option value="all">Todos os períodos</option>
                  {periodOptions.map((period) => (
                    <option key={period} value={period}>{formatPeriodo(period)}</option>
                  ))}
                </select>
              }
            >
              <DataTable>
                <thead>
                  <tr>
                    <th>PGC</th>
                    <th>Período</th>
                    <th>Valor</th>
                    <th>Status</th>
                    <th>Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHistoricoRows.map((h: { id: string; numeroPgc: string; periodo: string; evento: string }) => {
                    const relatedValue =
                      chartData.find((c: { x: string; y: number }) => c.x.includes(`PGC ${h.numeroPgc}`) && c.x.includes(h.periodo))?.y ?? null;
                    return (
                      <tr key={h.id}>
                        <td><strong>PGC {h.numeroPgc}</strong></td>
                        <td>{formatPeriodo(h.periodo)}</td>
                        <td>{relatedValue === null ? '-' : `R$ ${toCurrency(relatedValue)}`}</td>
                        <td><span className="status-pill success">Pago</span></td>
                        <td>
                          <ActionButton type="button" variant="secondary" onClick={() => handleOpenFolder(h.numeroPgc)} label="Arquivos" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </DataTable>
              {openFolderMessage ? <p style={{ marginTop: 8 }}>{openFolderMessage}</p> : null}
            </SectionCard>

            <ChartCard badge="Rendimentos" title="Evolução de Rendimentos">
              {chartData.length === 0 ? (
                <p>Sem rendimentos para exibir.</p>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'end', gap: 14, minHeight: 190, borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
                    {chartData.map((point: { x: string; y: number }) => {
                      const height = Math.max(8, Math.round((point.y / chartScale.max) * 160));
                      const label = point.x.split('|')[1]?.trim() ?? point.x;
                      return (
                        <div key={point.x} style={{ flex: 1, minWidth: 24, textAlign: 'center' }} title={`${point.x}: ${toCurrency(point.y)}`}>
                          <div style={{ marginBottom: 8, fontWeight: 700 }}>{`R$ ${toCurrency(point.y)}`}</div>
                          <div
                            style={{
                              height,
                              background: 'linear-gradient(180deg, #14b8a6, #0f766e)',
                              borderRadius: '8px 8px 0 0',
                            }}
                          />
                          <div style={{ marginTop: 8, color: 'var(--muted)' }}>{formatPeriodo(label)}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </ChartCard>
          </section>

          <section style={{ marginTop: 16 }}>
            <SectionCard
              badge="Descontos"
              title="Histórico de Descontos por PGC"
              tone="accent"
              actions={
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <select
                    value={discountPgcFilter}
                    onChange={(e) => setDiscountPgcFilter(e.target.value)}
                    style={{ minWidth: 130 }}
                  >
                    <option value="all">Todos os PGCs</option>
                    {discountPgcOptions.map((pgc) => (
                      <option key={pgc} value={pgc}>{`PGC ${pgc}`}</option>
                    ))}
                  </select>
                  <select
                    value={discountEmpresaFilter}
                    onChange={(e) => setDiscountEmpresaFilter(e.target.value)}
                    style={{ minWidth: 260 }}
                  >
                    <option value="all">Todas as empresas</option>
                    {discountEmpresaOptions.map((empresa) => (
                      <option key={empresa} value={empresa}>{empresa}</option>
                    ))}
                  </select>
                </div>
              }
            >
              <DataTable>
                <thead>
                  <tr>
                    <th>PGC</th>
                    <th>Empresa</th>
                    <th>Carryover anterior</th>
                    <th>Desconto total</th>
                    <th>Desconto aplicado</th>
                    <th>Restante para próximo PGC</th>
                    <th>Desconto acumulado</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDescontoHistoricoRows.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ color: 'var(--muted)' }}>
                        Sem histórico de descontos para este credor.
                      </td>
                    </tr>
                  ) : (
                    filteredDescontoHistoricoRows.map((row: DiscountHistoryRow) => (
                      <tr key={row.id}>
                        <td><strong>PGC {row.pgc}</strong></td>
                        <td>{row.empresa}</td>
                        <td>{`R$ ${toCurrency(row.carryover_anterior)}`}</td>
                        <td>{`R$ ${toCurrency(row.desconto_total)}`}</td>
                        <td>{`R$ ${toCurrency(row.desconto_aplicado)}`}</td>
                        <td>{`R$ ${toCurrency(row.restante_proximo_pgc)}`}</td>
                        <td>{`R$ ${toCurrency(row.desconto_acumulado)}`}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </DataTable>
            </SectionCard>
          </section>

          <section style={{ marginTop: 16 }}>
            <SectionCard
              badge="Mínimo"
              title="Histórico de Mínimo Garantido"
              tone="accent"
              actions={
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <select
                    value={minimoPgcFilter}
                    onChange={(e) => setMinimoPgcFilter(e.target.value)}
                    style={{ minWidth: 130 }}
                  >
                    <option value="all">Todos os PGCs</option>
                    {minimoPgcOptions.map((pgc) => (
                      <option key={pgc} value={pgc}>{`PGC ${pgc}`}</option>
                    ))}
                  </select>
                  <select
                    value={minimoEmpresaFilter}
                    onChange={(e) => setMinimoEmpresaFilter(e.target.value)}
                    style={{ minWidth: 260 }}
                  >
                    <option value="all">Todas as empresas</option>
                    {minimoEmpresaOptions.map((empresa) => (
                      <option key={empresa} value={empresa}>{empresa}</option>
                    ))}
                  </select>
                </div>
              }
            >
              <DataTable>
                <thead>
                  <tr>
                    <th>PGC</th>
                    <th>Empresa</th>
                    <th>Valor Bruto (AL)</th>
                    <th>Valor Mínimo (AO)</th>
                    <th>Total Acordado</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMinimoHistoricoRows.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ color: 'var(--muted)' }}>
                        Sem histórico de mínimos para este credor.
                      </td>
                    </tr>
                  ) : (
                    filteredMinimoHistoricoRows.map((row: MinimoHistoryRow) => (
                      <tr key={row.id}>
                        <td><strong>PGC {row.pgc}</strong></td>
                        <td>{row.empresa}</td>
                        <td>{`R$ ${toCurrency(row.valor_bruto)}`}</td>
                        <td>{`R$ ${toCurrency(row.valor_minimo)}`}</td>
                        <td>{`R$ ${toCurrency(row.valor_total)}`}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </DataTable>
            </SectionCard>
          </section>

          {isEmailModalOpen ? (
            <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Enviar e-mail do credor" onClick={() => setIsEmailModalOpen(false)}>
              <section className="card soft-primary modal-card" onClick={(e) => e.stopPropagation()}>
                <span className="chip primary">Envio de e-mail</span>
                <h3 style={{ marginTop: 8, marginBottom: 8 }}>Editar template antes de enviar</h3>
                <p style={{ marginTop: 0, color: 'var(--muted)' }}>
                  Credor: <strong>{credor.nomeExibivel}</strong> | PGC: <strong>{historicoRows[0]?.numeroPgc ?? '-'}</strong>
                </p>

                {emailModalLoading ? (
                  <p>Carregando template...</p>
                ) : (
                  <div className="grid" style={{ gap: 10 }}>
                    <label>
                      Mensagem principal
                      <textarea
                        rows={10}
                        value={emailTemplateDraft.mensagem_principal}
                        onChange={(e) =>
                          setEmailTemplateDraft((prev) => ({
                            ...prev,
                            mensagem_principal: e.target.value,
                          }))
                        }
                        style={{ minHeight: 200 }}
                      />
                    </label>
                    <label>
                      Texto mínimo
                      <textarea
                        rows={3}
                        value={emailTemplateDraft.texto_minimo}
                        onChange={(e) =>
                          setEmailTemplateDraft((prev) => ({
                            ...prev,
                            texto_minimo: e.target.value,
                          }))
                        }
                      />
                    </label>
                    <label>
                      Texto descontos
                      <textarea
                        rows={3}
                        value={emailTemplateDraft.texto_descontos}
                        onChange={(e) =>
                          setEmailTemplateDraft((prev) => ({
                            ...prev,
                            texto_descontos: e.target.value,
                          }))
                        }
                      />
                    </label>
                  </div>
                )}

                <div className="actions-row" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
                  <ActionButton type="button" variant="ghost" label="Fechar" onClick={() => setIsEmailModalOpen(false)} />
                  <ActionButton
                    type="button"
                    label={emailModalSaving ? 'Enviando...' : 'Salvar e enviar'}
                    onClick={handleSendFromModal}
                    disabled={emailModalLoading || emailModalSaving}
                  />
                </div>

                {emailModalMessage ? <p style={{ marginTop: 10 }}>{emailModalMessage}</p> : null}
              </section>
            </div>
          ) : null}
        </>
      )}
    </DashboardShell>
  );
}
