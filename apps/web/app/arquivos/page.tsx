'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DashboardShell } from '../components/dashboard-shell';
import { ActionButton, DataTable, SectionCard } from '../components/ui';
import { getDashboardEnvio, lgmListArquivos, listEmpresasPagadoras } from '../../lib/api';

function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ArquivosPage() {
  const [numeroPgc, setNumeroPgc] = useState('');
  const [empresa, setEmpresa] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    numero_pgc: string;
    empresa: string;
    total: number;
    files: Array<{
      name: string;
      relativePath: string;
      root: string;
      size: number;
      updatedAt: string;
    }>;
  } | null>(null);

  const empresasQuery = useQuery({
    queryKey: ['empresas-pagadoras'],
    queryFn: listEmpresasPagadoras,
  });

  const pgcQuery = useQuery({
    queryKey: ['dashboard-envio-pgc-options'],
    queryFn: () => getDashboardEnvio(),
  });

  const pgcOptions = useMemo<string[]>(
    () => (pgcQuery.data?.por_pgc ?? []).map((item: { numero_pgc: string }) => item.numero_pgc),
    [pgcQuery.data?.por_pgc],
  );

  async function handleLoadFiles(event: FormEvent) {
    event.preventDefault();
    if (!numeroPgc.trim()) {
      setError('Selecione um PGC para carregar arquivos.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await lgmListArquivos(numeroPgc.trim(), empresa || undefined);
      setResult(response);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <DashboardShell
      activeNav="arquivos"
      title="Arquivos"
      subtitle="Selecione empresa e PGC para carregar os arquivos sem precisar de ID"
    >
      <form onSubmit={handleLoadFiles}>
        <SectionCard badge="Filtro" title="Carregar arquivos por empresa e PGC" tone="primary">
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <label>
              Empresa
              <select value={empresa} onChange={(e) => setEmpresa(e.target.value)}>
                <option value="">Todas</option>
                {(empresasQuery.data ?? []).map((item) => (
                  <option key={item.id} value={item.nome_curto}>
                    {item.nome_curto}
                  </option>
                ))}
              </select>
            </label>

            <label>
              PGC
              <select value={numeroPgc} onChange={(e) => setNumeroPgc(e.target.value)} required>
                <option value="">Selecione</option>
                {pgcOptions.map((pgc) => (
                  <option key={pgc} value={pgc}>
                    {pgc}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="actions-row" style={{ marginTop: 12 }}>
            <ActionButton type="submit" label={loading ? 'Carregando...' : 'Carregar arquivos'} disabled={loading} />
          </div>

          {error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : null}
        </SectionCard>
      </form>

      <SectionCard
        badge="Resultado"
        title={`Arquivos encontrados: ${result?.total ?? 0}`}
        subtitle={result ? `PGC ${result.numero_pgc}${result.empresa ? ` | empresa ${result.empresa}` : ''}` : 'Nenhuma consulta executada ainda'}
        className="mt-16"
      >
        <DataTable>
          <thead>
            <tr>
              <th>Arquivo</th>
              <th>Pasta base</th>
              <th>Caminho</th>
              <th>Tamanho</th>
              <th>Atualizado em</th>
            </tr>
          </thead>
          <tbody>
            {(result?.files ?? []).map((file, index) => (
              <tr key={`${file.root}-${file.relativePath}-${index}`}>
                <td>{file.name}</td>
                <td>{file.root}</td>
                <td>{file.relativePath}</td>
                <td>{formatBytes(file.size)}</td>
                <td>{new Date(file.updatedAt).toLocaleString('pt-BR')}</td>
              </tr>
            ))}
            {!result || result.files.length === 0 ? (
              <tr>
                <td colSpan={5}>Nenhum arquivo encontrado para os filtros informados.</td>
              </tr>
            ) : null}
          </tbody>
        </DataTable>
      </SectionCard>
    </DashboardShell>
  );
}
