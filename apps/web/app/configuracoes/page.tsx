'use client';

import { CSSProperties, FormEvent, Fragment, useEffect, useRef, useState } from 'react';
import { DashboardShell } from '../components/dashboard-shell';
import {
  authMe,
  getEmailTemplate,
  getSystemSettings,
  SystemSettings,
  testSystemSender,
  updateEmailTemplate,
  updateSystemSettings,
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
  const [mailTab, setMailTab] = useState<'email' | 'smtp' | 'texto-default' | 'empresas-cnpj' | 'auditoria'>('email');
  const [emailTemplate, setEmailTemplate] = useState({
    mensagem_principal: '',
    texto_minimo: '',
    texto_descontos: '',
  });
  const [saving, setSaving] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState('');
  const [actorEmail, setActorEmail] = useState('unknown');

  const mensagemPrincipalRef = useRef<HTMLTextAreaElement | null>(null);
  const textoMinimoRef = useRef<HTMLTextAreaElement | null>(null);
  const textoDescontosRef = useRef<HTMLTextAreaElement | null>(null);

  function getTemplateTextareaRef(field: 'mensagem_principal' | 'texto_minimo' | 'texto_descontos') {
    if (field === 'mensagem_principal') return mensagemPrincipalRef;
    if (field === 'texto_minimo') return textoMinimoRef;
    return textoDescontosRef;
  }

  function insertTemplateVar(field: 'mensagem_principal' | 'texto_minimo' | 'texto_descontos', variable: string) {
    const textAreaRef = getTemplateTextareaRef(field);
    const element = textAreaRef.current;

    if (element) {
      const start = element.selectionStart ?? element.value.length;
      const end = element.selectionEnd ?? element.value.length;

      setEmailTemplate((prev) => {
        const current = prev[field] ?? '';
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
      const current = prev[field] ?? '';
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
        mensagem_principal: emailTemplate?.mensagem_principal ?? '',
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

  function updateEmpresaCnpjRow(index: number, field: 'empresa' | 'cnpj', value: string) {
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
      empresasCnpj: [...prev.empresasCnpj, { empresa: '', cnpj: '' }],
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
            aria-selected={mailTab === 'auditoria'}
            aria-controls="tab-auditoria-content"
            onClick={() => setMailTab('auditoria')}
            style={mailTab === 'auditoria' ? { ...pillBaseStyle, ...pillActiveStyle } : pillBaseStyle}
          >
            Auditoria
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
              <label>
                Mensagem principal (default)
                <textarea
                  ref={mensagemPrincipalRef}
                  value={emailTemplate.mensagem_principal}
                  onChange={(e) =>
                    setEmailTemplate((prev) => ({
                      ...prev,
                      mensagem_principal: e.target.value,
                    }))
                  }
                  rows={16}
                  style={{ minHeight: 320 }}
                />
                <div style={varHelpStyle}>
                  Variáveis disponíveis: {'{credor.nome}'}, {'{historico.numero_pgc}'}, {'{historico.periodo}'}, {'{sistema.remetente}'}, {'{info_minimo}'}, {'{info_descontos}'}.
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                  <button type="button" className="secondary" onClick={() => insertTemplateVar('mensagem_principal', '{credor.nome}')}>credor.nome</button>
                  <button type="button" className="secondary" onClick={() => insertTemplateVar('mensagem_principal', '{historico.numero_pgc}')}>historico.numero_pgc</button>
                  <button type="button" className="secondary" onClick={() => insertTemplateVar('mensagem_principal', '{historico.periodo}')}>historico.periodo</button>
                  <button type="button" className="secondary" onClick={() => insertTemplateVar('mensagem_principal', '{sistema.remetente}')}>sistema.remetente</button>
                  <button type="button" className="secondary" onClick={() => insertTemplateVar('mensagem_principal', '{info_minimo}')}>info_minimo</button>
                  <button type="button" className="secondary" onClick={() => insertTemplateVar('mensagem_principal', '{info_descontos}')}>info_descontos</button>
                </div>
              </label>
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
                  style={{ minHeight: 100 }}
                />
                <div style={varHelpStyle}>
                  Variáveis disponíveis: {'{minimo.valor}'}, {'{minimo.empresa}'}, {'{minimo.cnpj}'}.
                </div>
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
                  rows={6}
                  style={{ minHeight: 140 }}
                />
                <div style={varHelpStyle}>
                  Variáveis disponíveis: {'{linhas_descontos}'}.
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                  <button type="button" className="secondary" onClick={() => insertTemplateVar('texto_descontos', '{linhas_descontos}')}>linhas_descontos</button>
                </div>
              </label>
              <div style={{ display: 'flex', marginTop: 10 }}>
                <ActionButton
                  type="button"
                  variant="secondary"
                  onClick={handleSaveDefaultTemplate}
                  disabled={savingTemplate}
                  label={savingTemplate ? 'Salvando texto...' : 'Salvar texto default'}
                />
              </div>
            </div>
          ) : mailTab === 'empresas-cnpj' ? (
            <div id="tab-empresas-cnpj-content" role="tabpanel">
              <p style={{ marginTop: 0, marginBottom: 10, color: 'var(--muted)' }}>
                Essa lista e utilizada como base para localizar o CNPJ por empresa no arquivo de emissao.
              </p>
              <div className="grid" style={{ gridTemplateColumns: '1fr 240px 120px', gap: 8 }}>
                <strong>Empresa</strong>
                <strong>CNPJ</strong>
                <strong>Ação</strong>
                {settings.empresasCnpj.map((item, index) => (
                  <Fragment key={`empresa-cnpj-${index}`}>
                    <input
                      value={item.empresa}
                      onChange={(e) => updateEmpresaCnpjRow(index, 'empresa', e.target.value)}
                      placeholder="Nome da empresa"
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
    </DashboardShell>
  );
}
