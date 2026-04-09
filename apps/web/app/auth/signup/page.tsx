'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authSignup } from '../../../lib/api';
import { DashboardShell } from '../../components/dashboard-shell';
import { ActionButton, SectionCard } from '../../components/ui';

export default function SignupPage() {
  const router = useRouter();
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await authSignup({ nome, email, senha });
      router.push('/auth/login');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <DashboardShell activeNav="forms" title="Cadastro" subtitle="Criar novo usuário">
      <form onSubmit={onSubmit}>
        <SectionCard badge="Cadastro" title="Criar conta" subtitle="Configure seu acesso ao console" tone="primary">
        <label>
          Nome
          <input value={nome} onChange={(e) => setNome(e.target.value)} required />
        </label>
        <label>
          E-mail
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Senha
          <input type="password" minLength={8} value={senha} onChange={(e) => setSenha(e.target.value)} required />
        </label>
        <div className="actions-row" style={{ marginTop: 12 }}>
          <ActionButton type="submit" disabled={loading} label={loading ? 'Criando...' : 'Criar conta'} icon="+" />
          <Link className="btn-link secondary" href="/auth/login">Ir para entrar</Link>
        </div>
        {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
        </SectionCard>
      </form>
    </DashboardShell>
  );
}
