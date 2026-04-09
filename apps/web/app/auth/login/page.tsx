'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authLogin, setAuthToken } from '../../../lib/api';
import { DashboardShell } from '../../components/dashboard-shell';
import { ActionButton, SectionCard } from '../../components/ui';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const response = await authLogin({ email, senha });
      setAuthToken(response.access_token);
      router.push('/dashboard');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <DashboardShell activeNav="forms" title="Entrar" subtitle="Acesso ao sistema PGC">
      <form onSubmit={onSubmit}>
        <SectionCard badge="Acesso" title="Entrar no painel" subtitle="Use seu e-mail corporativo" tone="primary">
        <label>
          E-mail
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Senha
          <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
        </label>
        <div className="actions-row" style={{ marginTop: 12 }}>
          <ActionButton type="submit" disabled={loading} label={loading ? 'Entrando...' : 'Entrar'} icon="->" />
          <Link className="btn-link secondary" href="/auth/signup">Criar conta</Link>
          <Link className="btn-link secondary" href="/auth/password-reset-request">Esqueci a senha</Link>
        </div>
        {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
        </SectionCard>
      </form>
    </DashboardShell>
  );
}
