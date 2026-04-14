'use client';

import { CSSProperties, FormEvent, Fragment, useEffect, useRef, useState } from 'react';
import { DashboardShell } from '../components/dashboard-shell';
import {
  AppUser,
  authMe,
  deleteUser,
  EmailTemplate,
  getEmailTemplate,
  getSystemSettings,
  listUsers,
  SystemSettings,
  testSystemSender,
  updateEmailTemplate,
  updateSystemSettings,
  updateUserRole,
  updateUserStatus,
  adminCreateUser,
} from '../../lib/api';
import { ActionButton, SectionCard } from '../components/ui';

const EMPTY: SystemSettings = {
  email: {
    fromName: '',
    fromAddress: '',
    replyTo: '',
    assuntoPadrao: '',
  },
  envio: {
    loteMaximoCredores: 200,
    intervaloMsEntreEnvios: 0,
    maxTentativasPorCredor: 3,
  },
  processamento: {
    timeoutMsIngestao: 20000,
    timeoutMsCredor: 30000,
    timeoutMsArtefatos: 20000,
  },
  smtp: {
    provider: 'smtp',
    host: '',
    port: 587,
    secure: false,
    user: '',
    pass: '',
    sendgridApiKey: '',
    testTo: '',
  },
  empresasCnpj: [],
  audit: {
    updatedAt: '',
    updatedBy: '',
    changeCount: 0,
    history: [],
  },
};

export default function ConfiguracoesPage() {
  const [settings, setSettings] = useState<SystemSettings>(EMPTY);
  const [mailTab, setMailTab] = useState<'email' | 'smtp' | 'texto-default' | 'empresas-cnpj' | 'auditoria' | 'usuarios' | 'api'>('email');
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [emailTemplate, setEmailTemplate] = useState<EmailTemplate>({
    mensagem_laghetto_golden: '',
    mensagem_laghetto_sports: '',
    texto_minimo: '',
    texto_descontos: '',
  });
  const [saving, setSaving] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState('');
  const [actorEmail, setActorEmail] = useState('unknown');
  
  const [showUserModal, setShowUserModal] = useState(false);
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'CONSULTA' });
  const [creating, setCreating] = useState(false);

  const msgGoldenRef = useRef<HTMLTextAreaElement | null>(null);
  const msgSportsRef = useRef<HTMLTextAreaElement | null>(null);
  const textoMinimoRef = useRef<HTMLTextAreaElement | null>(null);
  const textoDescontosRef = useRef<HTMLTextAreaElement | null>(null);

  function getTemplateTextareaRef(field: keyof EmailTemplate) {
    if (field === 'mensagem_laghetto_golden') return msgGoldenRef;
    if (field === 'mensagem_laghetto_sports') return msgSportsRef;
    if (field === 'texto_minimo') return textoMinimoRef;
    return textoDescontosRef;
  }

  function insertTemplateVar(field: keyof EmailTemplate, variable: string) {
    const textAreaRef = getTemplateTextareaRef(field);
    const element = textAreaRef.current;

    if (element) {
      const start = element.selectionStart ?? element.value.length;
      const end = element.selectionEnd ?? element.value.length;

      setEmailTemplate((prev) => {
        const current = (prev[field] as string) ?? '';
        const next = `${current.slice(0, start)}${variable}${current.slice(end)}`;
        return {
          ...prev,
          [field]: next,
        };
      });

      const nextCaret = start + variable.length;
      requestAnimationFrame(() => {
        const nextEl = textAreaRef.current;
        if (!nextEl) return;
        nextEl.focus();
        nextEl.setSelectionRange(nextCaret, nextCaret);
      });
      return;
    }

    setEmailTemplate((prev) => {
      const current = (prev[field] as string) ?? '';
      const separator = current.length === 0 || current.endsWith('\n') ? '' : ' ';
      return {
        ...prev,
        [field]: `${current}${separator}${variable}`,
      };
    });
  }

  useEffect(() => {
    void (async () => {
      const [loaded, emailTemplate] = await Promise.all([getSystemSettings(), getEmailTemplate()]);
      setSettings(loaded);
      setEmailTemplate({
        mensagem_laghetto_golden: emailTemplate?.mensagem_laghetto_golden ?? '',
        mensagem_laghetto_sports: emailTemplate?.mensagem_laghetto_sports ?? '',
        texto_minimo: emailTemplate?.texto_minimo ?? '',
        texto_descontos: emailTemplate?.texto_descontos ?? '',
      });
      try {
        const me = await authMe();
        if (me?.email) setActorEmail(String(me.email));
      } catch {
        setActorEmail('unknown');
      }
    })();
  }, []);

  useEffect(() => {
    if (mailTab === 'usuarios') {
      void loadUsers();
    }
  }, [mailTab]);

  async function loadUsers() {
    setLoadingUsers(true);
    try {
      const data = await listUsers();
      setUsers(data);
    } catch (err) {
      setMessage(`Erro ao carregar usuários: ${(err as Error).message}`);
    } finally {
      setLoadingUsers(false);
    }
  }

  async function handleToggleUserStatus(id: string, current: boolean) {
    try {
      await updateUserStatus(id, !current);
      await loadUsers();
      setMessage('Status do usuário atualizado.');
    } catch (err) {
      setMessage(`Erro: ${(err as Error).message}`);
    }
  }

  async function handleUpdateUserRole(id: string, role: string) {
    try {
      await updateUserRole(id, role);
      await loadUsers();
      setMessage('Permissão do usuário atualizada.');
    } catch (err) {
      setMessage(`Erro: ${(err as Error).message}`);
    }
  }

  async function handleDeleteUser(id: string) {
    if (!confirm('Tem certeza que deseja excluir este usuário?')) return;
    try {
      await deleteUser(id);
      await loadUsers();
      setMessage('Usuário excluído.');
    } catch (err) {
      setMessage(`Erro: ${(err as Error).message}`);
    }
  }

  async function handleAdminCreateUser(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      await adminCreateUser(newUser);
      setMessage('Usuário criado com sucesso.');
      setShowUserModal(false);
      setNewUser({ name: '', email: '', password: '', role: 'CONSULTA' });
      await loadUsers();
    } catch (err) {
      setMessage(`Erro ao criar usuário: ${(err as Error).message}`);
    } finally {
      setCreating(false);
    }
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const saved = await updateSystemSettings({ ...settings, auditActor: actorEmail });
      setSettings(saved);
      setMessage('Configurações salvas com sucesso.');
    } finally {
      setSaving(false);
    }
  }

  async function handleTestSender() {
    setTesting(true);
    setMessage('');
    try {
      const result = await testSystemSender(settings.smtp.testTo || undefined);
      setMessage(`Teste enviado com sucesso para ${result.to}. messageId=${result.messageId}`);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setTesting(false);
    }
  }

  async function handleSaveDefaultTemplate() {
    setSavingTemplate(true);
    setMessage('');
    try {
      const saved = await updateEmailTemplate(emailTemplate);
      setEmailTemplate(saved);
      setMessage('Texto default salvo com sucesso.');
    } finally {
      setSavingTemplate(false);
    }
  }

  function updateEmpresaCnpjRow(index: number, field: 'empresa' | 'cnpj' | 'apelido', value: string) {
    setSettings((prev) => ({
      ...prev,
      empresasCnpj: prev.empresasCnpj.map((item, idx) =>
        idx === index ? { ...item, [field]: value } : item,
      ),
    }));
  }

  function addEmpresaCnpjRow() {
    setSettings((prev) => ({
      ...prev,
      empresasCnpj: [...prev.empresasCnpj, { empresa: '', cnpj: '', apelido: '' }],
    }));
  }

  function removeEmpresaCnpjRow(index: number) {
    setSettings((prev) => ({
      ...prev,
      empresasCnpj: prev.empresasCnpj.filter((_, idx) => idx !== index),
    }));
  }

  const pillBaseStyle: CSSProperties = {
    borderRadius: 999,
    padding: '8px 14px',
    border: '1px solid var(--border)',
    background: 'rgba(255,255,255,0.6)',
    color: 'inherit',
    cursor: 'pointer',
    fontWeight: 600,
    transition: 'all 180ms ease',
  };

  const pillActiveStyle: CSSProperties = {
    background: 'var(--primary)',
    color: '#fff',
    borderColor: 'var(--primary)',
    boxShadow: '0 8px 20px rgba(0,0,0,0.12)',
    transform: 'translateY(-1px)',
  };

  const varHelpStyle: CSSProperties = {
    marginTop: 6,
    fontSize: 12,
    color: 'var(--muted)',
    background: 'rgba(255,255,255,0.72)',
    border: '1px dashed var(--border)',
    borderRadius: 10,
    padding: '8px 10px',
  };

  return (
    <DashboardShell
      activeNav="configuracoes"
      title="Configurações do Sistema"
      subtitle="Controle de parâmetros globais: e-mail, envio e processamento"
    >
      <SectionCard
        badge="Entrega de E-mail"
        title="Configuração de remetente, SMTP e auditoria"
        tone="primary"
      >
        <div role="tablist" aria-label="Configuração de e-mail" style={{ display: 'flex', gap: 8, marginTop: 10, marginBottom: 12 }}>
          <button
            type="button"
            role="tab"
            aria-selected={mailTab === 'email'}
            aria-controls="tab-email-content"
            onClick={() => setMailTab('email')}
            style={mailTab === 'email' ? { ...pillBaseStyle, ...pillActiveStyle } : pillBaseStyle}
          >
            E-mail de disparo
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mailTab === 'smtp'}
            aria-controls="tab-smtp-content"
            onClick={() => setMailTab('smtp')}
            style={mailTab === 'smtp' ? { ...pillBaseStyle, ...pillActiveStyle } : pillBaseStyle}
          >
            SMTP
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mailTab === 'texto-default'}
            aria-controls="tab-texto-default-content"
            onClick={() => setMailTab('texto-default')}
            style={mailTab === 'texto-default' ? { ...pillBaseStyle, ...pillActiveStyle } : pillBaseStyle}
          >
            Texto Default
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mailTab === 'empresas-cnpj'}
            aria-controls="tab-empresas-cnpj-content"
            onClick={() => setMailTab('empresas-cnpj')}
            style={mailTab === 'empresas-cnpj' ? { ...pillBaseStyle, ...pillActiveStyle } : pillBaseStyle}
          >
            Empresas x CNPJ
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mailTab === 'usuarios'}
            aria-controls="tab-usuarios-content"
            onClick={() => setMailTab('usuarios')}
            style={mailTab === 'usuarios' ? { ...pillBaseStyle, ...pillActiveStyle } : pillBaseStyle}
          >
            Usuários
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mailTab === 'auditoria'}
            aria-controls="tab-auditoria-content"
            onClick={() => setMailTab('auditoria')}
            style={mailTab === 'auditoria' ? { ...pillBaseStyle, ...pillActiveStyle } : pillBaseStyle}
          >
            Auditoria
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mailTab === 'api'}
            aria-controls="tab-api-content"
            onClick={() => setMailTab('api')}
            style={mailTab === 'api' ? { ...pillBaseStyle, ...pillActiveStyle } : pillBaseStyle}
          >
            API / Doc
          </button>
        </div>

        <p style={{ marginTop: 4 }}>
          {mailTab === 'email'
            ? 'Defina o e-mail oficial de envio. Sem esse campo, o disparo aos credores é bloqueado.'
            : mailTab === 'smtp'
              ? 'Configure o provedor SMTP e teste o remetente antes de disparar em produção.'
              : mailTab === 'texto-default'
                ? 'Visualize o texto padrão da mensagem principal usada no envio.'
              : mailTab === 'empresas-cnpj'
                ? 'Cadastre as empresas pagadoras e CNPJs usados para preencher o arquivo de emissao.'
                : mailTab === 'usuarios'
                  ? 'Gerencie quem tem acesso ao sistema e quais são suas permissões.'
                  : mailTab === 'api'
                    ? 'Acesse a documentação técnica das APIs do sistema (Swagger).'
                    : 'Acompanhe quem alterou as configurações e quando cada mudança ocorreu.'}
        </p>

        <form className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }} onSubmit={handleSave}>
          <div
            style={{
              gridColumn: '1 / -1',
            }}
          >
          {mailTab === 'email' ? (
            <div id="tab-email-content" role="tabpanel">
              <label>
                Nome do remetente
                <input
                  value={settings.email.fromName}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      email: { ...prev.email, fromName: e.target.value },
                    }))
                  }
                  placeholder="Financeiro PGC"
                />
              </label>

              <label>
                E-mail de disparo
                <input
                  type="email"
                  value={settings.email.fromAddress}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      email: { ...prev.email, fromAddress: e.target.value },
                    }))
                  }
                  placeholder="financeiro@empresa.com.br"
                  required
                />
              </label>

              <label>
                Reply-to
                <input
                  type="email"
                  value={settings.email.replyTo}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      email: { ...prev.email, replyTo: e.target.value },
                    }))
                  }
                  placeholder="atendimento@empresa.com.br"
                />
              </label>

              <label>
                Assunto padrão
                <input
                  value={settings.email.assuntoPadrao}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      email: { ...prev.email, assuntoPadrao: e.target.value },
                    }))
                  }
                  placeholder="PGC {historico.numero_pgc} - {historico.periodo}"
                />
              </label>
            </div>
          ) : mailTab === 'smtp' ? (
            <div id="tab-smtp-content" role="tabpanel">
              <label>
                Provedor
                <select
                  value={settings.smtp.provider}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      smtp: { ...prev.smtp, provider: e.target.value as 'smtp' | 'sendgrid-smtp' },
                    }))
                  }
                >
                  <option value="smtp">SMTP corporativo</option>
                  <option value="sendgrid-smtp">SendGrid (SMTP)</option>
                </select>
              </label>

              <label>
                Host
                <input
                  value={settings.smtp.host}
                  onChange={(e) =>
                    setSettings((prev) => ({ ...prev, smtp: { ...prev.smtp, host: e.target.value } }))
                  }
                  placeholder="smtp.office365.com"
                />
              </label>

              <label>
                Porta
                <input
                  type="number"
                  value={settings.smtp.port}
                  onChange={(e) =>
                    setSettings((prev) => ({ ...prev, smtp: { ...prev.smtp, port: Number(e.target.value || 587) } }))
                  }
                />
              </label>

              <label>
                Usuário SMTP
                <input
                  value={settings.smtp.user}
                  onChange={(e) =>
                    setSettings((prev) => ({ ...prev, smtp: { ...prev.smtp, user: e.target.value } }))
                  }
                  placeholder="usuario@empresa.com.br"
                />
              </label>

              <label>
                Senha/API key SMTP
                <input
                  type="password"
                  value={settings.smtp.pass}
                  onChange={(e) =>
                    setSettings((prev) => ({ ...prev, smtp: { ...prev.smtp, pass: e.target.value } }))
                  }
                  placeholder="********"
                />
              </label>

              <label>
                Destino do teste
                <input
                  type="email"
                  value={settings.smtp.testTo}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      smtp: { ...prev.smtp, testTo: e.target.value },
                    }))
                  }
                  placeholder="seu-email@empresa.com.br"
                />
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={settings.smtp.secure}
                  onChange={(e) =>
                    setSettings((prev) => ({ ...prev, smtp: { ...prev.smtp, secure: e.target.checked } }))
                  }
                />
                Conexão segura (SSL/TLS)
              </label>

              <div style={{ display: 'flex', alignItems: 'end' }}>
                <ActionButton
                  type="button"
                  variant="secondary"
                  onClick={handleTestSender}
                  disabled={testing}
                  label={testing ? 'Testando...' : 'Testar remetente'}
                />
              </div>
            </div>
          ) : mailTab === 'texto-default' ? (
            <div id="tab-texto-default-content" role="tabpanel">
              <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                {/* CARD GOLDEN */}
                <div className="card soft-primary" style={{ padding: 16 }}>
                  <h4 style={{ marginTop: 0 }}>Laghetto Golden</h4>
                  <label>
                    Mensagem principal
                    <textarea
                      ref={msgGoldenRef}
                      value={emailTemplate.mensagem_laghetto_golden}
                      onChange={(e) =>
                        setEmailTemplate((prev) => ({
                          ...prev,
                          mensagem_laghetto_golden: e.target.value,
                        }))
                      }
                      rows={12}
                    />
                  </label>
                  <div style={varHelpStyle}>
                    Variáveis: {'{credor.nome}'}, {'{historico.numero_pgc}'}, {'{historico.periodo}'}, {'{info_minimo}'}, {'{info_descontos}'}.
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                    <button type="button" className="secondary tiny" onClick={() => insertTemplateVar('mensagem_laghetto_golden', '{credor.nome}')}>nome</button>
                    <button type="button" className="secondary tiny" onClick={() => insertTemplateVar('mensagem_laghetto_golden', '{historico.numero_pgc}')}>pgc</button>
                    <button type="button" className="secondary tiny" onClick={() => insertTemplateVar('mensagem_laghetto_golden', '{historico.periodo}')}>período</button>
                    <button type="button" className="secondary tiny" onClick={() => insertTemplateVar('mensagem_laghetto_golden', '{info_minimo}')}>minimo</button>
                    <button type="button" className="secondary tiny" onClick={() => insertTemplateVar('mensagem_laghetto_golden', '{info_descontos}')}>descontos</button>
                  </div>
                </div>

                {/* CARD SPORTS */}
                <div className="card soft-accent" style={{ padding: 16 }}>
                  <h4 style={{ marginTop: 0 }}>Laghetto Sports</h4>
                  <label>
                    Mensagem principal
                    <textarea
                      ref={msgSportsRef}
                      value={emailTemplate.mensagem_laghetto_sports}
                      onChange={(e) =>
                        setEmailTemplate((prev) => ({
                          ...prev,
                          mensagem_laghetto_sports: e.target.value,
                        }))
                      }
                      rows={12}
                    />
                  </label>
                  <div style={varHelpStyle}>
                    Variáveis: {'{credor.nome}'}, {'{historico.numero_pgc}'}, {'{historico.periodo}'}, {'{info_minimo}'}, {'{info_descontos}'}.
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                    <button type="button" className="secondary tiny" onClick={() => insertTemplateVar('mensagem_laghetto_sports', '{credor.nome}')}>nome</button>
                    <button type="button" className="secondary tiny" onClick={() => insertTemplateVar('mensagem_laghetto_sports', '{historico.numero_pgc}')}>pgc</button>
                    <button type="button" className="secondary tiny" onClick={() => insertTemplateVar('mensagem_laghetto_sports', '{historico.periodo}')}>período</button>
                    <button type="button" className="secondary tiny" onClick={() => insertTemplateVar('mensagem_laghetto_sports', '{info_minimo}')}>minimo</button>
                    <button type="button" className="secondary tiny" onClick={() => insertTemplateVar('mensagem_laghetto_sports', '{info_descontos}')}>descontos</button>
                  </div>
                </div>
              </div>

              <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 20, marginTop: 12 }}>
                <label>
                  Texto default de mínimo
                  <textarea
                    ref={textoMinimoRef}
                    value={emailTemplate.texto_minimo}
                    onChange={(e) =>
                      setEmailTemplate((prev) => ({
                        ...prev,
                        texto_minimo: e.target.value,
                      }))
                    }
                    rows={4}
                  />
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                    <button type="button" className="secondary" onClick={() => insertTemplateVar('texto_minimo', '{minimo.valor}')}>minimo.valor</button>
                    <button type="button" className="secondary" onClick={() => insertTemplateVar('texto_minimo', '{minimo.empresa}')}>minimo.empresa</button>
                    <button type="button" className="secondary" onClick={() => insertTemplateVar('texto_minimo', '{minimo.cnpj}')}>minimo.cnpj</button>
                  </div>
                </label>

                <label>
                  Texto default de descontos
                  <textarea
                    ref={textoDescontosRef}
                    value={emailTemplate.texto_descontos}
                    onChange={(e) =>
                      setEmailTemplate((prev) => ({
                        ...prev,
                        texto_descontos: e.target.value,
                      }))
                    }
                    rows={4}
                  />
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                    <button type="button" className="secondary" onClick={() => insertTemplateVar('texto_descontos', '{linhas_descontos}')}>linhas_descontos</button>
                  </div>
                </label>
              </div>

              <div style={{ display: 'flex', marginTop: 16 }}>
                <ActionButton
                  type="button"
                  variant="primary"
                  onClick={handleSaveDefaultTemplate}
                  disabled={savingTemplate}
                  label={savingTemplate ? 'Salvando textos...' : 'Salvar todos os textos padrão'}
                />
              </div>
            </div>
          ) : mailTab === 'empresas-cnpj' ? (
            <div id="tab-empresas-cnpj-content" role="tabpanel">
              <p style={{ marginTop: 0, marginBottom: 10, color: 'var(--muted)' }}>
                Essa lista e utilizada como base para localizar o CNPJ por empresa no arquivo de emissao.
              </p>
              <div className="grid" style={{ gridTemplateColumns: 'minmax(250px, 1fr) 180px 180px 100px', gap: 8 }}>
                <strong>Empresa (Oficial)</strong>
                <strong>Apelido (Reconhecimento)</strong>
                <strong>CNPJ</strong>
                <strong>Ação</strong>
                {settings.empresasCnpj.map((item, index) => (
                  <Fragment key={`empresa-cnpj-${index}`}>
                    <input
                      value={item.empresa}
                      onChange={(e) => updateEmpresaCnpjRow(index, 'empresa', e.target.value)}
                      placeholder="Nome oficial"
                    />
                    <input
                      value={item.apelido || ''}
                      onChange={(e) => updateEmpresaCnpjRow(index, 'apelido', e.target.value)}
                      placeholder="Ex: RISERVA"
                    />
                    <input
                      value={item.cnpj}
                      onChange={(e) => updateEmpresaCnpjRow(index, 'cnpj', e.target.value)}
                      placeholder="00.000.000/0000-00"
                    />
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => removeEmpresaCnpjRow(index)}
                    >
                      Remover
                    </button>
                  </Fragment>
                ))}
              </div>
              <div style={{ display: 'flex', marginTop: 12 }}>
                <ActionButton type="button" variant="secondary" onClick={addEmpresaCnpjRow} label="Adicionar empresa" />
              </div>
            </div>
          ) : mailTab === 'usuarios' ? (
            <div id="tab-usuarios-content" role="tabpanel">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <p style={{ margin: 0, color: 'var(--muted)' }}>
                  Gerencie quem tem acesso ao sistema e quais são suas permissões.
                </p>
                <ActionButton 
                  label="Novo Usuário" 
                  onClick={() => setShowUserModal(true)}
                  icon="+"
                />
              </div>
              {loadingUsers ? (
                <p>Carregando usuários...</p>
              ) : (
                <div className="card" style={{ padding: 0, overflow: 'hidden', border: '1px solid var(--border)' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                    <thead>
                      <tr style={{ background: 'var(--bg-soft)', borderBottom: '1px solid var(--border)' }}>
                        <th style={{ textAlign: 'left', padding: '12px 16px' }}>Nome / E-mail</th>
                        <th style={{ textAlign: 'left', padding: '12px 16px' }}>Função</th>
                        <th style={{ textAlign: 'center', padding: '12px 16px' }}>Status</th>
                        <th style={{ textAlign: 'right', padding: '12px 16px' }}>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((u) => (
                        <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ fontWeight: 600 }}>{u.nome}</div>
                            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{u.email}</div>
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <select
                              value={u.role}
                              onChange={(e) => handleUpdateUserRole(u.id, e.target.value)}
                              style={{ padding: '4px 8px', fontSize: 12, borderRadius: 6 }}
                            >
                              <option value="ADMIN">ADMIN</option>
                              <option value="OPERADOR">OPERADOR</option>
                              <option value="CONSULTA">CONSULTA</option>
                            </select>
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                            <span
                              style={{
                                display: 'inline-block',
                                padding: '4px 10px',
                                borderRadius: 99,
                                fontSize: 11,
                                fontWeight: 700,
                                background: u.active ? '#dcfce7' : '#fee2e2',
                                color: u.active ? '#166534' : '#991b1b',
                              }}
                            >
                              {u.active ? 'ATIVO' : 'PENDENTE'}
                            </span>
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                              <button
                                type="button"
                                className="secondary tiny"
                                onClick={() => handleToggleUserStatus(u.id, u.active)}
                              >
                                {u.active ? 'Suspender' : 'Ativar'}
                              </button>
                              <button
                                type="button"
                                className="danger tiny"
                                onClick={() => handleDeleteUser(u.id)}
                              >
                                Excluir
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : mailTab === 'api' ? (
            <div id="tab-api-content" role="tabpanel">
              <div className="card soft-primary" style={{ padding: 24, textAlign: 'center' }}>
                <h3 style={{ marginTop: 0 }}>Documentação Técnica da API</h3>
                <p style={{ color: 'var(--muted)', marginBottom: 20 }}>
                  Acesse o Swagger UI para visualizar todos os endpoints, modelos de dados e testar as requisições do sistema.
                </p>
                <a 
                  href="/api-proxy/docs" 
                  target="_blank" 
                  className="ui-btn primary"
                  style={{ display: 'inline-flex', padding: '12px 24px', textDecoration: 'none' }}
                >
                  Abrir Swagger UI
                </a>
              </div>
            </div>
          ) : (
            <div id="tab-auditoria-content" role="tabpanel">
              <p>
                Última atualização: {settings.audit.updatedAt || '-'} por {settings.audit.updatedBy || '-'} | total de mudanças: {settings.audit.changeCount}
              </p>
              <ul>
                {settings.audit.history.slice(0, 10).map((item, idx) => (
                  <li key={`${item.at}-${idx}`}>
                    {item.at} - {item.by} - {item.changes.join(', ')}
                  </li>
                ))}
              </ul>
            </div>
          )}
          </div>

          {mailTab === 'email' ? (
            <>
              <label>
                Máx. credores por lote
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={settings.envio.loteMaximoCredores}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      envio: { ...prev.envio, loteMaximoCredores: Number(e.target.value || 1) },
                    }))
                  }
                />
              </label>

              <label>
                Intervalo entre envios (ms)
                <input
                  type="number"
                  min={0}
                  max={60000}
                  value={settings.envio.intervaloMsEntreEnvios}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      envio: { ...prev.envio, intervaloMsEntreEnvios: Number(e.target.value || 0) },
                    }))
                  }
                />
              </label>

              <label>
                Tentativas por credor
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={settings.envio.maxTentativasPorCredor}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      envio: { ...prev.envio, maxTentativasPorCredor: Number(e.target.value || 1) },
                    }))
                  }
                />
              </label>

              <label>
                Timeout ingestão (ms)
                <input
                  type="number"
                  min={1000}
                  max={3600000}
                  value={settings.processamento.timeoutMsIngestao}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      processamento: { ...prev.processamento, timeoutMsIngestao: Number(e.target.value || 1000) },
                    }))
                  }
                />
              </label>

              <label>
                Timeout por credor (ms)
                <input
                  type="number"
                  min={1000}
                  max={3600000}
                  value={settings.processamento.timeoutMsCredor}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      processamento: { ...prev.processamento, timeoutMsCredor: Number(e.target.value || 1000) },
                    }))
                  }
                />
              </label>

              <label>
                Timeout artefatos (ms)
                <input
                  type="number"
                  min={1000}
                  max={3600000}
                  value={settings.processamento.timeoutMsArtefatos}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      processamento: { ...prev.processamento, timeoutMsArtefatos: Number(e.target.value || 1000) },
                    }))
                  }
                />
              </label>
            </>
          ) : null}

          <div style={{ display: 'flex', alignItems: 'end' }}>
            <ActionButton type="submit" disabled={saving} label={saving ? 'Salvando...' : 'Salvar configurações'} />
          </div>
        </form>

        {message ? <p style={{ marginTop: 10 }}>{message}</p> : null}
      </SectionCard>

      {showUserModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.4)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: 20
        }}>
          <div style={{ width: '100%', maxWidth: '500px' }}>
            <SectionCard title="Cadastrar Novo Usuário" badge="Administração" tone="primary">
              <form onSubmit={handleAdminCreateUser}>
                <label>
                  Nome completo
                  <input 
                    value={newUser.name} 
                    onChange={e => setNewUser(p => ({ ...p, name: e.target.value }))} 
                    required 
                    placeholder="Ex: João Silva"
                  />
                </label>
                <label>
                  E-mail institucional
                  <input 
                    type="email" 
                    value={newUser.email} 
                    onChange={e => setNewUser(p => ({ ...p, email: e.target.value }))} 
                    required 
                    placeholder="email@empresa.com.br"
                  />
                </label>
                <label>
                  Senha inicial
                  <input 
                    type="password" 
                    value={newUser.password} 
                    onChange={e => setNewUser(p => ({ ...p, password: e.target.value }))} 
                    required 
                    placeholder="Mínimo 6 caracteres"
                  />
                </label>
                <label>
                  Cargo / Permissão
                  <select 
                    value={newUser.role} 
                    onChange={e => setNewUser(p => ({ ...p, role: e.target.value }))}
                  >
                    <option value="ADMIN">Administrador (Acesso total)</option>
                    <option value="OPERADOR">Operador (Upload e Disparo)</option>
                    <option value="CONSULTA">Consulta (Leitura apenas)</option>
                  </select>
                </label>

                <div className="actions-row" style={{ marginTop: 20 }}>
                  <ActionButton 
                    type="submit" 
                    label={creating ? 'Criando...' : 'Criar Usuário'} 
                    disabled={creating} 
                  />
                  <button 
                    type="button" 
                    className="secondary" 
                    onClick={() => setShowUserModal(false)}
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </SectionCard>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
