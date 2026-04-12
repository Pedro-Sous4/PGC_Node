'use client';

import Link from 'next/link';
import { Suspense, FormEvent, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { authLogin, setAuthToken } from '../../../lib/api';
import { DashboardShell } from '../../components/dashboard-shell';
import { ActionButton, SectionCard } from '../../components/ui';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [error, setError] = useState<string | null>(searchParams.get('error') === 'inactive' ? 'Sua conta redirecionada via login social aguarda aprovação de um administrador.' : null);
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
          <Link className="btn-link secondary" href="/auth/password-reset-request">Esqueci a senha</Link>
        </div>

        {error && <p style={{ color: 'var(--danger)', marginTop: 16, textAlign: 'center', fontSize: 13 }}>{error}</p>}
        </SectionCard>
      </form>
    </DashboardShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  );
}
