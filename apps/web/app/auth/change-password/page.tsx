'use client';

import { FormEvent, useState } from 'react';
import { authChangePassword } from '../../../lib/api';
import { DashboardShell } from '../../components/dashboard-shell';
import { ActionButton, SectionCard } from '../../components/ui';

export default function ChangePasswordPage() {
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [ok, setOk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setOk(false);
    try {
      await authChangePassword({ senhaAtual, novaSenha });
      setOk(true);
      setSenhaAtual('');
      setNovaSenha('');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <DashboardShell activeNav="forms" title="Trocar Senha" subtitle="Alterar senha da conta autenticada">
      <form onSubmit={onSubmit}>
        <SectionCard badge="Conta" title="Atualizar senha" subtitle="Use no mínimo 8 caracteres" tone="primary">
        <label>
          Senha atual
          <input type="password" minLength={8} value={senhaAtual} onChange={(e) => setSenhaAtual(e.target.value)} required />
        </label>
        <label>
          Nova senha
          <input type="password" minLength={8} value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} required />
        </label>
        <div style={{ marginTop: 12 }}>
          <ActionButton type="submit" label="Alterar senha" icon="*" />
        </div>
        {ok && <p>Senha alterada com sucesso.</p>}
        {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
        </SectionCard>
      </form>
    </DashboardShell>
  );
}
