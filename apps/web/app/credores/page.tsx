'use client';

import Link from 'next/link';
import { FormEvent, useMemo, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  batchCredores,
  createCredor,
  exportCredoresBlob,
  listCredores,
  listGrupos,
  updateCredor,
  getDashboardEnvio,
} from '../../lib/api';
import { DashboardShell } from '../components/dashboard-shell';
import { ActionButton, DataTable, SectionCard, StatusBadge } from '../components/ui';


export default function CredoresPage() {
  const [nome, setNome] = useState('');
  const [grupoId, setGrupoId] = useState('');
  const [enviado, setEnviado] = useState('');
  const [numeroPgc, setNumeroPgc] = useState('');
  const [hasMinimo, setHasMinimo] = useState('');
  const [hasDesconto, setHasDesconto] = useState('');
  const [pgcOptions, setPgcOptions] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [newNome, setNewNome] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newGrupoId, setNewGrupoId] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingCredorId, setEditingCredorId] = useState('');
  const [editNome, setEditNome] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editGrupoId, setEditGrupoId] = useState('');
  const [currentPage, setCurrentPage] = useState(0);
  const PAGE_SIZE = 20;


  const gruposQuery = useQuery({ queryKey: ['grupos'], queryFn: listGrupos });
  const credoresQuery = useQuery({
    queryKey: ['credores', nome, grupoId, enviado, numeroPgc, hasMinimo, hasDesconto, currentPage],
    queryFn: () => listCredores({ 
      nome, 
      grupoId, 
      enviado, 
      numero_pgc: numeroPgc, 
      hasMinimo,
      hasDesconto,
      skip: currentPage * PAGE_SIZE, 
      take: PAGE_SIZE 
    }),
  });

  // Reset page when filters change
  useEffect(() => { setCurrentPage(0); }, [nome, grupoId, enviado, numeroPgc, hasMinimo, hasDesconto]);

  const pageInfo = credoresQuery.data?.page;
  const totalPages = pageInfo ? Math.ceil(pageInfo.total / PAGE_SIZE) : 0;

  // Carregar opções de PGC ao montar ou ao mudar grupo
  useEffect(() => {
    (async () => {
      try {
        const dashboard = await getDashboardEnvio(grupoId || undefined);
        const pgcs: string[] = Array.from(
          new Set((dashboard?.por_pgc ?? []).map((row: { numero_pgc: string }) => String(row.numero_pgc ?? '').trim())),
        );
        pgcs.sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
        setPgcOptions(pgcs);
        if (numeroPgc && !pgcs.includes(numeroPgc)) setNumeroPgc('');
      } catch {
        setPgcOptions([]);
      }
    })();
  }, [grupoId]);

  const rows = credoresQuery.data?.data ?? [];
  const displayedRows = useMemo(
    () =>
      [...rows].sort((a, b) =>
        (a.nome ?? '').localeCompare(b.nome ?? '', 'pt-BR', {
          sensitivity: 'base',
        }),
      ),
    [rows],
  );
  const allSelected = useMemo(
    () => displayedRows.length > 0 && displayedRows.every((row) => selected.includes(row.id)),
    [displayedRows, selected],
  );

  async function runBatch(path: 'marcar-enviado' | 'marcar-nao-enviado' | 'excluir') {
    if (selected.length === 0) return;

    if (path === 'excluir') {
      const confirmed = window.confirm(
        `Confirma exclusao de ${selected.length} credor(es)? Esta acao nao pode ser desfeita.`,
      );
      if (!confirmed) return;
    }

    await batchCredores(path, selected);
    setSelected([]);
    await credoresQuery.refetch();
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (!newNome.trim()) return;

    await createCredor({
      nome: newNome,
      email: newEmail || undefined,
      grupoId: newGrupoId || undefined,
    });

    setNewNome('');
    setNewEmail('');
    setNewGrupoId('');
    setIsCreateModalOpen(false);
    await credoresQuery.refetch();
  }

  function closeCreateModal() {
    setIsCreateModalOpen(false);
  }

  function openEditModal(row: { id: string; nome: string; email?: string; grupo?: { id: string } | null }) {
    setEditingCredorId(row.id);
    setEditNome(row.nome ?? '');
    setEditEmail(row.email ?? '');
    setEditGrupoId(row.grupo?.id ?? '');
    setIsEditModalOpen(true);
  }

  function closeEditModal() {
    setIsEditModalOpen(false);
    setEditingCredorId('');
    setEditNome('');
    setEditEmail('');
    setEditGrupoId('');
  }

  async function handleUpdate(event: FormEvent) {
    event.preventDefault();
    if (!editingCredorId || !editNome.trim()) return;

    await updateCredor(editingCredorId, {
      nome: editNome,
      email: editEmail || undefined,
      grupoId: editGrupoId || undefined,
    });

    closeEditModal();
    await credoresQuery.refetch();
  }

  async function handleExport(type: 'csv' | 'xlsx') {
    try {
      const blob = await exportCredoresBlob(type, { nome, grupoId, enviado, numero_pgc: numeroPgc });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `credores.${type}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      alert(`Falha ao exportar: ${err.message}`);
    }
  }

  return (
    <DashboardShell
      activeNav="credores"
      title="Lista de Credores"
      subtitle="Filtros, ações em lote, exportações CSV/XLSX e gestão administrativa"
      topActionLabel="Novo credor"
      onTopActionClick={() => setIsCreateModalOpen(true)}
    >
      <SectionCard badge="Filtros" title="Buscar credores" tone="primary">
        <form className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }} onSubmit={(e) => e.preventDefault()}>
          <label>
            Buscar por nome
            <input value={nome} onChange={(e) => setNome(e.target.value)} />
          </label>
          <label>
            Grupo
            <select value={grupoId} onChange={(e) => setGrupoId(e.target.value)}>
              <option value="">Todos</option>
              {(gruposQuery.data ?? []).map((grupo) => (
                <option key={grupo.id} value={grupo.id}>{grupo.nome}</option>
              ))}
            </select>
          </label>
          <label>
            Status de envio
            <select value={enviado} onChange={(e) => setEnviado(e.target.value)}>
              <option value="">Todos</option>
              <option value="true">Enviados</option>
              <option value="false">Não enviados</option>
            </select>
          </label>
          <label>
            Número PGC
            <select value={numeroPgc} onChange={(e) => setNumeroPgc(e.target.value)}>
              <option value="">Todos</option>
              {pgcOptions.map((pgc) => (
                <option key={pgc} value={pgc}>{pgc}</option>
              ))}
            </select>
          </label>
          <label>
            Mínimo
            <select value={hasMinimo} onChange={(e) => setHasMinimo(e.target.value)}>
              <option value="">Todos</option>
              <option value="sim">Sim</option>
              <option value="nao">Não</option>
            </select>
          </label>
          <label>
            Desconto
            <select value={hasDesconto} onChange={(e) => setHasDesconto(e.target.value)}>
              <option value="">Todos</option>
              <option value="sim">Sim</option>
              <option value="nao">Não</option>
            </select>
          </label>
          <div className="actions-row" style={{ alignItems: 'end' }}>
            <ActionButton type="button" variant="secondary" onClick={() => handleExport('csv')} label="Export CSV" />
            <ActionButton type="button" variant="secondary" onClick={() => handleExport('xlsx')} label="Export XLSX" />
          </div>
        </form>
      </SectionCard>

      <SectionCard badge="Lista" title="Credores" subtitle="Ações em lote e detalhamento" className="mt-16">
        <div className="actions-row" style={{ marginBottom: 12 }}>
          <ActionButton variant="secondary" onClick={() => runBatch('marcar-enviado')} disabled={selected.length === 0} label="Marcar enviados" />
          <ActionButton variant="secondary" onClick={() => runBatch('marcar-nao-enviado')} disabled={selected.length === 0} label="Marcar não enviados" />
          <ActionButton variant="danger" onClick={() => runBatch('excluir')} disabled={selected.length === 0} label="Excluir selecionados" />
        </div>

        <DataTable>
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(e) => setSelected(e.target.checked ? displayedRows.map((r) => r.id) : [])}
                    style={{ width: 14, height: 14 }}
                  />
                </th>
                <th>Nome</th>
                <th>Email</th>
                <th>PGC</th>
                <th>Mínimo</th>
                <th>Desconto</th>
                <th>Valor PGC</th>
                <th>Status</th>
                <th>Grupo</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {displayedRows.map((row) => {
                const checked = selected.includes(row.id);
                return (
                  <tr key={row.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => setSelected((prev) => e.target.checked ? [...prev, row.id] : prev.filter((id) => id !== row.id))}
                        style={{ width: 14, height: 14 }}
                      />
                    </td>
                    <td><strong>{row.nome}</strong></td>
                    <td>{row.email}</td>
                    <td><span className="chip secondary">PGC {row.numero_pgc || '-'}</span></td>
                    <td>{row.ultimo_minimo > 0 ? `R$ ${row.ultimo_minimo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '-'}</td>
                    <td>{row.ultimo_desconto > 0 ? `R$ ${row.ultimo_desconto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '-'}</td>
                    <td><strong>R$ {row.valor_pgc.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong></td>
                    <td>
                      <StatusBadge status={row.enviado ? 'Enviado' : 'Não enviado'} />
                    </td>
                    <td>{row.grupo?.nome ?? '-'}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <ActionButton type="button" variant="secondary" label="Editar" onClick={() => openEditModal(row)} />
                        <Link className="link-action" href={`/credores/${row.id}`}>Detalhe</Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
        </DataTable>

        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, padding: '8px 0' }}>
            <span style={{ fontSize: 13, color: 'var(--text-secondary, #666)' }}>
              {pageInfo ? `${pageInfo.skip + 1}–${Math.min(pageInfo.skip + PAGE_SIZE, pageInfo.total)} de ${pageInfo.total}` : ''}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <ActionButton
                variant="secondary"
                label="← Anterior"
                disabled={currentPage === 0}
                onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
              />
              <span style={{ display: 'flex', alignItems: 'center', fontSize: 13 }}>
                Página {currentPage + 1} de {totalPages}
              </span>
              <ActionButton
                variant="secondary"
                label="Próxima →"
                disabled={currentPage >= totalPages - 1}
                onClick={() => setCurrentPage((p) => p + 1)}
              />
            </div>
          </div>
        )}
      </SectionCard>

      {isCreateModalOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Novo credor"
          onClick={closeCreateModal}
          className="modal-backdrop"
        >
          <section
            className="card soft-accent modal-card"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="chip accent">Cadastro</span>
            <h3 style={{ marginTop: 8 }}>Novo credor</h3>
            <form className="grid" style={{ gridTemplateColumns: '1fr', gap: 12 }} onSubmit={handleCreate}>
              <label>
                Nome
                <input value={newNome} onChange={(e) => setNewNome(e.target.value)} required />
              </label>
              <label>
                E-mail
                <input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
              </label>
              <label>
                Grupo
                <select value={newGrupoId} onChange={(e) => setNewGrupoId(e.target.value)}>
                  <option value="">Sem grupo</option>
                  {(gruposQuery.data ?? []).map((grupo) => (
                    <option key={grupo.id} value={grupo.id}>{grupo.nome}</option>
                  ))}
                </select>
              </label>
              <div className="actions-row" style={{ justifyContent: 'flex-end' }}>
                <ActionButton type="button" variant="secondary" onClick={closeCreateModal} label="Cancelar" />
                <ActionButton type="submit" label="Salvar credor" />
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {isEditModalOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Editar credor"
          onClick={closeEditModal}
          className="modal-backdrop"
        >
          <section
            className="card soft-primary modal-card"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="chip primary">Edição</span>
            <h3 style={{ marginTop: 8 }}>Editar credor</h3>
            <form className="grid" style={{ gridTemplateColumns: '1fr', gap: 12 }} onSubmit={handleUpdate}>
              <label>
                Nome
                <input value={editNome} onChange={(e) => setEditNome(e.target.value)} required />
              </label>
              <label>
                E-mail
                <input value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
              </label>
              <label>
                Grupo
                <select value={editGrupoId} onChange={(e) => setEditGrupoId(e.target.value)}>
                  <option value="">Sem grupo</option>
                  {(gruposQuery.data ?? []).map((grupo) => (
                    <option key={grupo.id} value={grupo.id}>{grupo.nome}</option>
                  ))}
                </select>
              </label>
              <div className="actions-row" style={{ justifyContent: 'flex-end' }}>
                <ActionButton type="button" variant="secondary" onClick={closeEditModal} label="Cancelar" />
                <ActionButton type="submit" label="Salvar alterações" />
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </DashboardShell>
  );
}
