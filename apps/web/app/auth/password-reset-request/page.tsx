'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { authRequestPasswordReset } from '../../../lib/api';
import { DashboardShell } from '../../components/dashboard-shell';
import { ActionButton, SectionCard } from '../../components/ui';

export default function PasswordResetRequestPage() {
  const [email, setEmail] = useState('');
  const [tokenDev, setTokenDev] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const response = await authRequestPasswordReset({ email });
      setTokenDev(response.reset_token_dev ?? null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <DashboardShell activeNav="forms" title="Recuperar Senha" subtitle="Solicitar token de redefinição">
      <form onSubmit={onSubmit}>
        <SectionCard badge="Recuperação" title="Solicitar token" tone="primary">
        <label>
          E-mail
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <div className="actions-row" style={{ marginTop: 12 }}>
          <ActionButton type="submit" label="Solicitar redefinição" icon="@" />
          <Link className="btn-link secondary" href="/auth/password-reset">Já tenho token</Link>
        </div>
        {tokenDev && <p className="mono">Token de desenvolvimento: {tokenDev}</p>}
        {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
        </SectionCard>
      </form>
    </DashboardShell>
  );
}
