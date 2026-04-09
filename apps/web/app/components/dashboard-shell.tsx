"use client";

import { useState } from 'react';
import {
  BarChart3,
  Bell,
  CircleHelp,
  FolderOpen,
  Goal,
  LayoutDashboard,
  Mail,
  Settings,
  ShieldCheck,
  Upload,
  Users,
} from 'lucide-react';
import { authLogout } from '../../lib/api';
import { AvatarBadge, PageHeader } from './ui';

interface DashboardShellProps {
  title: string;
  subtitle: string;
  activeNav:
    | 'dashboard'
    | 'processamentos'
    | 'importacao'
    | 'emails'
    | 'relatorios'
    | 'arquivos'
    | 'forms'
    | 'jobs'
    | 'credores'
    | 'upload-emails'
    | 'enviar-emails'
    | 'configuracoes'
    | 'sports'
    | 'lgm';
  topActionLabel?: string;
  onTopActionClick?: () => void;
  children: React.ReactNode;
}

const navItems = [
  { key: 'dashboard', label: 'Dashboard', href: '/', icon: LayoutDashboard },
  { key: 'credores', label: 'Credores', href: '/credores', icon: Users },
  { key: 'importacao', label: 'Importação de Credores', href: '/upload-emails', icon: Upload },
  { key: 'emails', label: 'Enviar PGC', href: '/enviar-emails', icon: Mail },
  { key: 'arquivos', label: 'Arquivos', href: '/arquivos', icon: FolderOpen },
  { key: 'sports', label: 'Laghetto Sports', href: '/laghetto-sports', icon: Goal },
  { key: 'lgm', label: 'Laghetto Golden', href: '/lgm', icon: ShieldCheck },
  { key: 'relatorios', label: 'Relatórios', href: '/dashboard', icon: BarChart3 },
  { key: 'configuracoes', label: 'Configurações', href: '/configuracoes', icon: Settings },
];

function normalizeActiveNav(activeNav: DashboardShellProps['activeNav']) {
  if (activeNav === 'forms') return 'dashboard';
  if (activeNav === 'jobs') return 'dashboard';
  if (activeNav === 'upload-emails') return 'importacao';
  if (activeNav === 'enviar-emails') return 'emails';
  return activeNav;
}

export function DashboardShell({
  title,
  subtitle,
  activeNav,
  topActionLabel,
  onTopActionClick,
  children,
}: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const navActiveKey = normalizeActiveNav(activeNav);

  async function handleLogout() {
    try {
      await authLogout();
    } finally {
      window.location.href = '/auth/login';
    }
  }

  return (
    <div className="zen-shell">
      {sidebarOpen ? <button className="zen-overlay" type="button" onClick={() => setSidebarOpen(false)} aria-label="Fechar menu" /> : null}

      <aside className={`zen-sidebar ${sidebarOpen ? 'is-open' : ''}`}>
        <div className="zen-brand">
          <span className="zen-brand-badge">PG</span>
          <div>
            <strong>PGC</strong>
            <span>Painel operacional</span>
          </div>
        </div>

        <nav className="zen-nav" aria-label="Navegação principal">
          <p className="zen-nav-title">Área de trabalho</p>
          {navItems.map((item) => {
            const active = item.key === navActiveKey;
            const Icon = item.icon;
            return (
              <a
                key={item.key}
                href={item.href}
                className={`zen-nav-item ${active ? 'is-active' : ''}`}
                onClick={() => setSidebarOpen(false)}
              >
                <span className="zen-nav-icon" aria-hidden="true"><Icon size={16} strokeWidth={2.1} /></span>
                {item.label}
              </a>
            );
          })}
        </nav>

        <div className="zen-user-wrap zen-user-wrap-top">
          {userMenuOpen ? (
            <div className="zen-user-menu" role="menu" aria-label="Menu do usuário">
              <a href="/configuracoes" className="zen-user-menu-item" onClick={() => setUserMenuOpen(false)}>
                Configuração
              </a>
              <a href="/auth/change-password" className="zen-user-menu-item" onClick={() => setUserMenuOpen(false)}>
                Alterar senha
              </a>
              <button type="button" className="zen-user-menu-item danger" onClick={handleLogout}>
                Sair
              </button>
            </div>
          ) : null}

          <div className="zen-user">
            <AvatarBadge name="Admin Sistema" tone="green" />
            <div>
              <strong>Admin</strong>
              <span>Operações PGC</span>
            </div>
            <button
              type="button"
              className="zen-user-menu-toggle"
              aria-label="Abrir menu do usuário"
              onClick={() => setUserMenuOpen((open) => !open)}
            >
              ...
            </button>
          </div>
        </div>
      </aside>

      <div className="zen-main">
        <header className="zen-topbar">
          <div className="zen-topbar-left">
            <button className="zen-menu-btn" type="button" onClick={() => setSidebarOpen((open) => !open)} aria-label="Abrir menu">
              <span />
              <span />
              <span />
            </button>
            <div className="zen-search">Painel de gestão de rendimentos e disparos PGC</div>
          </div>

          <div className="zen-topbar-actions" aria-label="Ações rápidas da barra superior">
            <button type="button" className="zen-icon-btn" aria-label="Notificações"><Bell size={16} strokeWidth={2.2} /></button>
            <button type="button" className="zen-icon-btn" aria-label="Informações"><CircleHelp size={16} strokeWidth={2.2} /></button>
          </div>

          {onTopActionClick ? (
            <button type="button" className="zen-primary-btn" onClick={onTopActionClick}>
              + {topActionLabel ?? 'Nova ação'}
            </button>
          ) : null}
        </header>

        <main className="zen-content">
          <PageHeader title={title} subtitle={subtitle} />
          {children}
        </main>
      </div>
    </div>
  );
}
