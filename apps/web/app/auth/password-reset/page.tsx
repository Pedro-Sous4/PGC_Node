'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { authResetPassword } from '../../../lib/api';
import { DashboardShell } from '../../components/dashboard-shell';
import { ActionButton, SectionCard } from '../../components/ui';

export default function PasswordResetPage() {
  const [token, setToken] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [ok, setOk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await authResetPassword({ token, novaSenha });
      setOk(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <DashboardShell activeNav="forms" title="Redefinir Senha" subtitle="Aplicar token e criar nova senha">
      <form onSubmit={onSubmit}>
        <SectionCard badge="Segurança" title="Definir nova senha" tone="primary">
        <label>
          Token
          <input value={token} onChange={(e) => setToken(e.target.value)} required />
        </label>
        <label>
          Nova senha
          <input type="password" minLength={8} value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} required />
        </label>
        <div className="actions-row" style={{ marginTop: 12 }}>
          <ActionButton type="submit" label="Redefinir" icon="*" />
          <Link className="btn-link secondary" href="/auth/login">Voltar para entrar</Link>
        </div>
        {ok && <p>Senha redefinida com sucesso.</p>}
        {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
        </SectionCard>
      </form>
    </DashboardShell>
  );
}
