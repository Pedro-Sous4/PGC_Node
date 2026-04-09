'use client';

import { FormEvent, useState } from 'react';
import { uploadEmails } from '../../lib/api';
import { DashboardShell } from '../components/dashboard-shell';
import { ActionButton, MetricCard, SectionCard } from '../components/ui';

export default function UploadEmailsPage() {
  const [file, setFile] = useState<File | null>(null);
  const [allowProtected, setAllowProtected] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!file) return;

    setLoading(true);
    setError(null);
    try {
      const response = await uploadEmails(file, allowProtected);
      setResult(response);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <DashboardShell
      activeNav="upload-emails"
      title="Importação de e-mails"
      subtitle="Importação CSV/XLSX com validação de grupo e atualização de credores"
    >
      <form onSubmit={onSubmit}>
        <SectionCard badge="Importação" title="Carregar planilha de contatos" tone="primary">
        <label>
          Arquivo CSV/XLSX (colunas: nome, email, grupo)
          <input type="file" accept=".csv,.xlsx,.xls" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>

        <label style={{ marginTop: 12, display: 'block' }}>
          <input type="checkbox" checked={allowProtected} onChange={(e) => setAllowProtected(e.target.checked)} />
          Permitir sobrescrever e-mail protegido
        </label>

        <div style={{ marginTop: 12 }}>
          <ActionButton type="submit" disabled={!file || loading} label={loading ? 'Processando...' : 'Enviar arquivo'} icon="^" />
        </div>

        {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
        </SectionCard>
      </form>

      {result && (
        <SectionCard badge="Resultado" title="Resumo da importação" tone="accent" className="mt-16" >
          <div className="grid ui-metric-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            <MetricCard label="Criados" value={result.created} tone="primary" />
            <MetricCard label="Atualizados" value={result.updated} tone="neutral" />
            <MetricCard label="Ignorados" value={result.skipped} tone="accent" />
          </div>
          <ul>
            {(result.errors ?? []).map((line: string, index: number) => (
              <li key={`${line}-${index}`}>{line}</li>
            ))}
          </ul>
        </SectionCard>
      )}
    </DashboardShell>
  );
}
