'use client';

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  getCentralDescontos,
  updateCredorHistorico,
  downloadCredorPdf,
  getEmailTemplate,
  enviarEmails,
} from '../../lib/api';
import { DashboardShell } from '../components/dashboard-shell';
import { SectionCard, DataTable, ActionButton, StatusBadge } from '../components/ui';
import Link from 'next/link';

const EMPRESA_NOMES_OFICIAIS: Record<string, string> = {
  'altos': 'ALTOS DA BORGES EMPREENDIMENTOS IMOBILIARIOS LTDA',
  'altos da borges': 'ALTOS DA BORGES EMPREENDIMENTOS IMOBILIARIOS LTDA',
  'gvp': 'GVP PARTICIPACOES E INVESTIMENTOS LTDA',
  'reserva dos vinhedos': 'RESERVA DOS VINHEDOS INCORPORADORA SPE LTDA',
  'lgm/jpz': 'LGM PARTICIPACOES LTDA | FILIAL PEDRAS ALTAS',
  'golden/lgm': 'GOLDEN LAGHETTO EMPREENDIMENTOS IMOBILIARIOS SPE LTD',
  'athivabrasil': 'ATHIVABRASIL EMPREENDIMENTOS IMOBILIARIOS LTDA',
  'canela': 'CANELA EMPREENDIMENTOS IMOBILIARIOS LTDA',
  'asa delta': 'ASA DELTA EMPREENDIMENTOS IMOBILIARIOS LTDA',
  'lgm/golden': 'LGM PARTICIPACOES LTDA | FILIAL BORGES',
  'lsrg': 'LSRG RESORT SPE LTDA SCP',
  'sci': 'SCI RESORT SPE LTDA SCP',
  'jpz': 'JPZ EMPREENDIMENTOS LTDA',
};

function formatEmpresaNome(empresa: string): string {
  if (!empresa) return '-';
  const clean = empresa.trim().toLowerCase();
  if (EMPRESA_NOMES_OFICIAIS[clean]) {
    return EMPRESA_NOMES_OFICIAIS[clean];
  }
  if (clean === 'altos' || clean.startsWith('altos ')) {
    return 'ALTOS DA BORGES EMPREENDIMENTOS IMOBILIARIOS LTDA';
  }
  return empresa;
}

export default function CentralDescontosPage() {
  const [pgcFilter, setPgcFilter] = useState('');
  const [empresaFilter, setEmpresaFilter] = useState('');
  const [nomeFilter, setNomeFilter] = useState('');
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<any>(null);
  const [downloadingPdfId, setDownloadingPdfId] = useState<string | null>(null);

  // Email Preview Modal state
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailModalRow, setEmailModalRow] = useState<any>(null);
  const [emailModalLoading, setEmailModalLoading] = useState(false);
  const [emailModalSending, setEmailModalSending] = useState(false);
  const [emailModalMessage, setEmailModalMessage] = useState('');
  const [emailTemplateDraft, setEmailTemplateDraft] = useState({
    mensagem_principal: '',
    texto_minimo: '',
    texto_descontos: '',
  });

  // Edit form state
  const [editMinimoGarantido, setEditMinimoGarantido] = useState(0);
  const [editCarryover, setEditCarryover] = useState(0);
  const [editDescontoTotal, setEditDescontoTotal] = useState(0);
  const [editDescontoAplicado, setEditDescontoAplicado] = useState(0);
  const [editRestante, setEditRestante] = useState(0);
  const [editMotivo, setEditMotivo] = useState('');
  const [pgcOptions, setPgcOptions] = useState<string[]>([]);

  const openEmailModal = async (row: any) => {
    setEmailModalRow(row);
    setEmailModalOpen(true);
    setEmailModalLoading(true);
    setEmailModalMessage('');
    try {
      const template = await getEmailTemplate();
      const isSports = String(row.empresa ?? '').toUpperCase().includes('SPORTS');
      const msgDefault = isSports ? template.mensagem_laghetto_sports : template.mensagem_laghetto_golden;
      setEmailTemplateDraft({
        mensagem_principal: msgDefault,
        texto_minimo: template.texto_minimo,
        texto_descontos: template.texto_descontos,
      });
    } catch (err: any) {
      setEmailModalMessage(err.message || 'Falha ao carregar template.');
    } finally {
      setEmailModalLoading(false);
    }
  };

  const handleSendEmailFromModal = async () => {
    if (!emailModalRow) return;
    setEmailModalSending(true);
    setEmailModalMessage('');
    try {
      const result = await enviarEmails({
        escopo: 'credor',
        credorIds: [emailModalRow.credorId],
        numero_pgc: String(emailModalRow.numero_pgc),
        custom_mensagem_principal: emailTemplateDraft.mensagem_principal,
        custom_texto_minimo: emailTemplateDraft.texto_minimo,
        custom_texto_descontos: emailTemplateDraft.texto_descontos,
      });
      const sent = result.total_geral?.sent ?? result.sent ?? 0;
      const failed = result.total_geral?.failed ?? result.failed ?? 0;
      setEmailModalMessage(`Disparo finalizado. Enviados: ${sent} | Falhas: ${failed}`);
    } catch (err: any) {
      setEmailModalMessage(err.message || 'Falha ao enviar e-mail.');
    } finally {
      setEmailModalSending(false);
    }
  };

  useEffect(() => {
    import('../../lib/api').then(({ getDashboardEnvio }) => {
      getDashboardEnvio().then(dashboard => {
        const pgcs: string[] = Array.from(
          new Set((dashboard?.por_pgc ?? []).map((row: { numero_pgc: string }) => String(row.numero_pgc ?? '').trim())),
        );
        pgcs.sort((a, b) => Number(b) - Number(a));
        setPgcOptions(pgcs);
        if (pgcs.length > 0 && !pgcFilter) {
          setPgcFilter(pgcs[0]); // Seleciona o PGC mais recente por padrao
        }
      }).catch(() => setPgcOptions([]));
    });
  }, []);

  const { data, refetch, isLoading } = useQuery({
    queryKey: ['central-descontos', pgcFilter, empresaFilter, nomeFilter],
    queryFn: () => getCentralDescontos({ numero_pgc: pgcFilter, empresa: empresaFilter, nome: nomeFilter }),
  });

  const openEditModal = (row: any) => {
    setSelectedRow(row);
    setEditMinimoGarantido(row.minimoGarantido ?? 0);
    setEditCarryover(row.carryoverAnterior);
    setEditDescontoTotal(row.descontoTotal);
    setEditDescontoAplicado(row.descontoAplicado);
    setEditRestante(row.restanteProximoPgc);
    setEditMotivo('');
    setEditModalOpen(true);
  };

  const closeEditModal = () => {
    setEditModalOpen(false);
    setSelectedRow(null);
  };

  const handleDownloadPdf = async (row: any) => {
    setDownloadingPdfId(row.credorId);
    try {
      await downloadCredorPdf(row.credorId, `${row.credorNome} - PGC ${row.numero_pgc}.pdf`);
    } catch (err: any) {
      alert(`Falha ao baixar PDF: ${err.message}`);
    } finally {
      setDownloadingPdfId(null);
    }
  };

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!selectedRow) return;
      await updateCredorHistorico(selectedRow.credorId, selectedRow.numero_pgc, {
        empresa: selectedRow.empresa,
        minimoGarantido: editMinimoGarantido,
        carryoverAnterior: editCarryover,
        descontoTotal: editDescontoTotal,
        descontoAplicado: editDescontoAplicado,
        restanteProximoPgc: editRestante,
        motivo: editMotivo,
      });
    },
    onSuccess: () => {
      refetch();
      closeEditModal();
    },
    onError: (err: any) => {
      alert(`Erro ao atualizar: ${err.message}`);
    }
  });

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate();
  };

  return (
    <DashboardShell
      activeNav="credores"
      title="Central de Descontos"
      subtitle="Gerencie os descontos e mínimos garantidos de todos os credores em um só lugar."
    >
      <SectionCard title="Filtros" subtitle="Filtrar descontos">
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
          <label>
            Buscar por nome
            <input value={nomeFilter} onChange={e => setNomeFilter(e.target.value)} placeholder="Ex: João" />
          </label>
          <label>
            PGC
            <select value={pgcFilter} onChange={e => setPgcFilter(e.target.value)}>
              <option value="">Todos</option>
              {pgcOptions.map(n => (
                <option key={n} value={n}>PGC {n}</option>
              ))}
            </select>
          </label>
          <label>
            Empresa
            <select value={empresaFilter} onChange={e => setEmpresaFilter(e.target.value)}>
              <option value="">Todas</option>
              <option value="RESERVA DOS VINHEDOS">RESERVA DOS VINHEDOS INCORPORADORA SPE LTDA</option>
              <option value="ALTOS">ALTOS DA BORGES EMPREENDIMENTOS IMOBILIARIOS LTDA</option>
              <option value="FILIAL PEDRAS ALTAS">LGM PARTICIPACOES LTDA | FILIAL PEDRAS ALTAS</option>
              <option value="GVP">GVP PARTICIPACOES E INVESTIMENTOS LTDA</option>
              <option value="GOLDEN LAGHETTO">GOLDEN LAGHETTO EMPREENDIMENTOS IMOBILIARIOS SPE LTD</option>
              <option value="ATHIVABRASIL">ATHIVABRASIL EMPREENDIMENTOS IMOBILIARIOS LTDA</option>
              <option value="CANELA">CANELA EMPREENDIMENTOS IMOBILIARIOS LTDA</option>
              <option value="ASA DELTA">ASA DELTA EMPREENDIMENTOS IMOBILIARIOS LTDA</option>
              <option value="FILIAL BORGES">LGM PARTICIPACOES LTDA | FILIAL BORGES</option>
              <option value="LSRG">LSRG RESORT SPE LTDA SCP</option>
              <option value="SCI">SCI RESORT SPE LTDA SCP</option>
              <option value="JPZ">JPZ EMPREENDIMENTOS LTDA</option>
            </select>
          </label>
        </div>
      </SectionCard>

      <SectionCard title="Descontos e Mínimos Garantidos" subtitle="Lista de eventos financeiros consolidados" className="mt-16">
        {isLoading ? (
          <p>Carregando...</p>
        ) : (
          <DataTable>
            <thead>
              <tr>
                <th>Credor</th>
                <th>PGC</th>
                <th>Empresa</th>
                <th>Mínimo Garantido</th>
                <th>Carryover Anterior</th>
                <th>Desconto Total</th>
                <th>Aplicado</th>
                <th>Restante</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {(data || []).map((row) => (
                <tr key={`${row.credorId}-${row.numero_pgc}-${row.empresa}`}>
                  <td><strong>{row.credorNome}</strong></td>
                  <td><span className="chip secondary">PGC {row.numero_pgc}</span></td>
                  <td>{formatEmpresaNome(row.empresa)}</td>
                  <td>{row.minimoGarantido > 0 ? `R$ ${row.minimoGarantido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '-'}</td>
                  <td>R$ {row.carryoverAnterior.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                  <td>R$ {row.descontoTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                  <td>R$ {row.descontoAplicado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                  <td><strong>R$ {row.restanteProximoPgc.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong></td>
                  <td>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <ActionButton
                        variant="secondary"
                        onClick={() => openEditModal(row)}
                        label="Editar"
                      />
                      <ActionButton
                        variant="secondary"
                        onClick={() => openEmailModal(row)}
                        label="E-mail"
                      />
                      <ActionButton
                        variant="secondary"
                        onClick={() => handleDownloadPdf(row)}
                        label={downloadingPdfId === row.credorId ? 'Baixando...' : 'PDF Emissão'}
                        disabled={downloadingPdfId === row.credorId}
                      />
                    </div>
                  </td>
                </tr>
              ))}
              {data?.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center' }}>Nenhum registro encontrado.</td>
                </tr>
              )}
            </tbody>
          </DataTable>
        )}

        {pgcOptions.length > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, padding: '8px 0' }}>
            <span style={{ fontSize: 13, color: 'var(--text-secondary, #666)' }}>
              Mostrando eventos do PGC atual
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <ActionButton
                variant="secondary"
                label="← PGC Anterior"
                disabled={!pgcFilter || pgcOptions.indexOf(pgcFilter) >= pgcOptions.length - 1}
                onClick={() => {
                  const idx = pgcOptions.indexOf(pgcFilter);
                  if (idx >= 0 && idx < pgcOptions.length - 1) setPgcFilter(pgcOptions[idx + 1]);
                }}
              />
              <span style={{ display: 'flex', alignItems: 'center', fontSize: 13 }}>
                PGC {pgcFilter || 'Todos'} (Pág {pgcFilter ? pgcOptions.indexOf(pgcFilter) + 1 : 1} de {pgcOptions.length})
              </span>
              <ActionButton
                variant="secondary"
                label="Próximo PGC →"
                disabled={!pgcFilter || pgcOptions.indexOf(pgcFilter) <= 0}
                onClick={() => {
                  const idx = pgcOptions.indexOf(pgcFilter);
                  if (idx > 0) setPgcFilter(pgcOptions[idx - 1]);
                }}
              />
            </div>
          </div>
        )}
      </SectionCard>

      {editModalOpen && selectedRow && (
        <div
          role="dialog"
          className="modal-backdrop"
          onClick={closeEditModal}
        >
          <section className="card modal-card" onClick={e => e.stopPropagation()}>
            <h3>Editar Histórico de Desconto</h3>
            <p><strong>Credor:</strong> {selectedRow.credorNome} | <strong>PGC:</strong> {selectedRow.numero_pgc} | <strong>Empresa:</strong> {formatEmpresaNome(selectedRow.empresa)}</p>
            <form onSubmit={handleUpdate} className="grid" style={{ gridTemplateColumns: '1fr', gap: 12, marginTop: 16 }}>
              <label>
                Mínimo Garantido (R$)
                <input
                  type="number"
                  step="0.01"
                  value={editMinimoGarantido}
                  onChange={e => setEditMinimoGarantido(Number(e.target.value))}
                />
              </label>
              <label>
                Carryover Anterior
                <input type="number" step="0.01" value={editCarryover} onChange={e => setEditCarryover(Number(e.target.value))} />
              </label>
              <label>
                Desconto Total
                <input type="number" step="0.01" value={editDescontoTotal} onChange={e => setEditDescontoTotal(Number(e.target.value))} />
              </label>
              <label>
                Desconto Aplicado
                <input type="number" step="0.01" value={editDescontoAplicado} onChange={e => setEditDescontoAplicado(Number(e.target.value))} />
              </label>
              <label>
                Restante Próximo PGC
                <input type="number" step="0.01" value={editRestante} onChange={e => setEditRestante(Number(e.target.value))} />
              </label>
              <label>
                Motivo do Ajuste Manual
                <textarea value={editMotivo} onChange={e => setEditMotivo(e.target.value)} required />
              </label>
              <div className="actions-row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
                <ActionButton type="button" variant="secondary" onClick={closeEditModal} label="Cancelar" />
                <ActionButton type="submit" label={updateMutation.isPending ? 'Salvando...' : 'Salvar Alterações'} disabled={updateMutation.isPending} />
              </div>
            </form>
          </section>
        </div>
      )}

      {emailModalOpen && emailModalRow && (
        <div
          role="dialog"
          className="modal-backdrop"
          onClick={() => setEmailModalOpen(false)}
        >
          <section className="card modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 640 }}>
            <span className="chip primary">Preview & Envio de E-mail</span>
            <h3 style={{ marginTop: 8, marginBottom: 8 }}>E-mail para {emailModalRow.credorNome}</h3>
            <p style={{ marginTop: 0, color: 'var(--muted)' }}>
              <strong>PGC:</strong> {emailModalRow.numero_pgc} | <strong>Empresa:</strong> {formatEmpresaNome(emailModalRow.empresa)} | <strong>Desconto Aplicado:</strong> R$ {Number(emailModalRow.descontoAplicado).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>

            {emailModalLoading ? (
              <p>Carregando template...</p>
            ) : (
              <div className="grid" style={{ gap: 12, marginTop: 12 }}>
                <label>
                  Mensagem Principal (Preview / Edição):
                  <textarea
                    rows={8}
                    value={emailTemplateDraft.mensagem_principal}
                    onChange={e => setEmailTemplateDraft(prev => ({ ...prev, mensagem_principal: e.target.value }))}
                    style={{ width: '100%', marginTop: 4, fontFamily: 'monospace', fontSize: 13 }}
                  />
                </label>
                <label>
                  Texto de Mínimo Garantido:
                  <input
                    value={emailTemplateDraft.texto_minimo}
                    onChange={e => setEmailTemplateDraft(prev => ({ ...prev, texto_minimo: e.target.value }))}
                    style={{ width: '100%', marginTop: 4 }}
                  />
                </label>
                <label>
                  Texto de Descontos Aplicados:
                  <input
                    value={emailTemplateDraft.texto_descontos}
                    onChange={e => setEmailTemplateDraft(prev => ({ ...prev, texto_descontos: e.target.value }))}
                    style={{ width: '100%', marginTop: 4 }}
                  />
                </label>

                {emailModalMessage && (
                  <p style={{ margin: '8px 0', padding: '8px 12px', borderRadius: 6, background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', fontSize: 13 }}>
                    {emailModalMessage}
                  </p>
                )}

                <div className="actions-row" style={{ justifyContent: 'flex-end', marginTop: 12, gap: 8 }}>
                  <ActionButton type="button" variant="secondary" onClick={() => setEmailModalOpen(false)} label="Fechar" />
                  <ActionButton
                    type="button"
                    onClick={handleSendEmailFromModal}
                    label={emailModalSending ? 'Enviando...' : 'Confirmar e Enviar E-mail'}
                    disabled={emailModalSending}
                  />
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </DashboardShell>
  );
}
