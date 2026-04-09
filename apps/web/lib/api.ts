const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';

const TOKEN_KEY = 'pgc_auth_token';

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setAuthToken(token: string) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearAuthToken() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(TOKEN_KEY);
}

export interface Grupo {
  id: string;
  nome: string;
}

export interface EmpresaPagadora {
  id: string;
  nome?: string;
  nome_curto: string;
  nome_completo: string;
  cnpj?: string;
}

export interface CredorRow {
  id: string;
  slug: string;
  nome: string;
  nome_normalizado: string;
  email?: string;
  periodo?: string;
  numero_pgc?: string;
  enviado: boolean;
  data_envio?: string;
  grupo?: Grupo;
  valor_total: number;
}

export interface JobState {
  requestId: string;
  status: 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'ERROR' | 'CANCELED';
  stage: string;
  percent: number;
  currentCredor?: string;
  successCount: number;
  errorCount: number;
  errors: Array<{ credorSlug?: string; code: string; message: string }>;
  credores: Array<{ credorSlug: string; credorName?: string; state: string; message?: string }>;
  createdAt: string;
  updatedAt: string;
  artifacts: Array<{ type: 'CSV' | 'XLSX' | 'ZIP' | 'PDF'; path: string }>;
}

export interface SystemSettings {
  email: {
    fromName: string;
    fromAddress: string;
    replyTo: string;
    assuntoPadrao: string;
  };
  envio: {
    loteMaximoCredores: number;
    intervaloMsEntreEnvios: number;
    maxTentativasPorCredor: number;
  };
  processamento: {
    timeoutMsIngestao: number;
    timeoutMsCredor: number;
    timeoutMsArtefatos: number;
  };
  smtp: {
    provider: 'smtp' | 'sendgrid-smtp';
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
    sendgridApiKey: string;
    testTo: string;
  };
  empresasCnpj: Array<{
    empresa: string;
    cnpj: string;
  }>;
  audit: {
    updatedAt: string;
    updatedBy: string;
    changeCount: number;
    history: Array<{ at: string; by: string; changes: string[] }>;
  };
}

export interface EmailSendResult {
  sent: number;
  failed: number;
  pending: number;
  details: Array<{
    credorId: string;
    status: string;
    attempts: number;
    fromEmail?: string;
    info_minimo?: string;
    info_descontos?: string;
    error?: string;
    batch?: number;
  }>;
  lotes?: Array<{
    lote: number;
    totalCredores: number;
    sent: number;
    failed: number;
    pending: number;
  }>;
  total_geral?: {
    totalCredores: number;
    sent: number;
    failed: number;
    pending: number;
    quantidadeLotes: number;
    tamanhoLoteConfigurado: number;
  };
}

export async function createUploadJob(flow: string, credores: string[]): Promise<{ request_id: string }> {
  const res = await fetch(`${API}/jobs/pgc/upload`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ flow, credores }),
  });

  if (!res.ok) throw new Error('Falha ao iniciar job');
  return res.json() as Promise<{ request_id: string }>;
}

export async function getJobStatus(requestId: string): Promise<JobState> {
  const res = await fetch(`${API}/jobs/${requestId}/status`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Falha ao obter status');
  return res.json() as Promise<JobState>;
}

export async function reprocessJob(requestId: string, credores: string[]): Promise<void> {
  const res = await fetch(`${API}/jobs/${requestId}/reprocess`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ credores }),
  });
  if (!res.ok) throw new Error('Falha ao reprocessar');
}

export function streamJob(requestId: string, onMessage: (state: JobState) => void): EventSource {
  const source = new EventSource(`${API}/jobs/${requestId}/stream`);
  source.onmessage = (event) => {
    onMessage(JSON.parse(event.data) as JobState);
  };
  return source;
}

export async function listGrupos(): Promise<Grupo[]> {
  const res = await fetch(`${API}/grupos`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Falha ao listar grupos');
  return res.json() as Promise<Grupo[]>;
}

export async function listCredores(params: {
  nome?: string;
  grupoId?: string;
  enviado?: string;
  skip?: number;
  take?: number;
}): Promise<{ data: CredorRow[]; page: { skip: number; take: number; total: number } }> {
  const query = new URLSearchParams();
  if (params.nome) query.set('nome', params.nome);
  if (params.grupoId) query.set('grupoId', params.grupoId);
  if (params.enviado === 'true' || params.enviado === 'false') query.set('enviado', params.enviado);
  query.set('skip', String(params.skip ?? 0));
  query.set('take', String(params.take ?? 20));

  const res = await fetch(`${API}/credores?${query.toString()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Falha ao listar credores');
  return res.json() as Promise<{ data: CredorRow[]; page: { skip: number; take: number; total: number } }>;
}

export async function getCredor(id: string) {
  const res = await fetch(`${API}/credores/${id}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Falha ao obter credor');
  return res.json();
}

export async function openCredorFolder(id: string, numero_pgc?: string) {
  const res = await fetch(`${API}/credores/${id}/open-folder`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ numero_pgc }),
  });
  if (!res.ok) {
    let detail = 'Falha ao abrir pasta do credor';
    try {
      const payload = await res.json();
      if (payload?.message) detail = String(payload.message);
    } catch {
      // noop
    }
    throw new Error(detail);
  }
  return res.json() as Promise<{ opened: boolean; path?: string; message?: string }>;
}

export function exportCredorPdfUrl(id: string) {
  return `${API}/credores/${id}/export/pdf`;
}

export async function createCredor(payload: {
  nome: string;
  email?: string;
  periodo?: string;
  grupoId?: string;
}) {
  const res = await fetch(`${API}/credores`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Falha ao criar credor');
  return res.json();
}

export async function updateCredor(
  id: string,
  payload: {
    nome?: string;
    email?: string;
    periodo?: string;
    grupoId?: string;
  },
) {
  const res = await fetch(`${API}/credores/${id}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Falha ao atualizar credor');
  return res.json();
}

export async function batchCredores(path: 'marcar-enviado' | 'marcar-nao-enviado' | 'excluir', ids: string[]) {
  const res = await fetch(`${API}/credores/batch/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) {
    let detail = '';
    try {
      const payload = await res.json();
      detail = payload?.message ? `: ${payload.message}` : '';
    } catch {
      detail = '';
    }
    throw new Error(`Falha em acao em lote${detail}`);
  }
  return res.json();
}

export function exportCredoresCsvUrl() {
  return `${API}/credores/export/csv`;
}

export function exportCredoresXlsxUrl() {
  return `${API}/credores/export/xlsx`;
}

export async function uploadEmails(file: File, allowProtectedUpdate = false) {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API}/uploads/emails?allow_protected_update=${allowProtectedUpdate}`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) throw new Error('Falha no upload de e-mails');
  return res.json();
}

export async function getDashboardEnvio(grupoId?: string) {
  const suffix = grupoId ? `?grupoId=${encodeURIComponent(grupoId)}` : '';
  const res = await fetch(`${API}/dashboard/envio${suffix}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Falha ao carregar dashboard');
  return res.json();
}

export async function getEmailTemplate() {
  const res = await fetch(`${API}/emails/template`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Falha ao obter template de e-mail');
  return res.json();
}

export async function updateEmailTemplate(payload: {
  mensagem_principal: string;
  texto_minimo: string;
  texto_descontos: string;
}) {
  const res = await fetch(`${API}/emails/template`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Falha ao salvar template de e-mail');
  return res.json();
}

export async function enviarEmails(payload: {
  grupoId?: string;
  numero_pgc: string;
  escopo: 'todos' | 'credor' | 'empresa';
  credorIds?: string[];
  empresa_nome_curto?: string;
}): Promise<EmailSendResult> {
  const res = await fetch(`${API}/emails/enviar`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Falha ao enviar e-mails');
  return res.json() as Promise<EmailSendResult>;
}

export async function getEmailReport(limit = 100) {
  const res = await fetch(`${API}/emails/relatorio?limit=${limit}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Falha ao obter relatorio de e-mails');
  return res.json();
}

export async function getSystemSettings(): Promise<SystemSettings> {
  const res = await fetch(`${API}/system-settings`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Falha ao carregar configuracoes do sistema');
  return res.json() as Promise<SystemSettings>;
}

export async function updateSystemSettings(
  payload: Partial<SystemSettings> & { auditActor?: string },
): Promise<SystemSettings> {
  const res = await fetch(`${API}/system-settings`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Falha ao salvar configuracoes do sistema');
  return res.json() as Promise<SystemSettings>;
}

export async function testSystemSender(to?: string) {
  const res = await fetch(`${API}/system-settings/test-email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ to }),
  });
  if (!res.ok) {
    let detail = 'Falha ao testar remetente';
    try {
      const payload = await res.json();
      if (payload?.message) detail = String(payload.message);
    } catch {
      // noop
    }
    throw new Error(detail);
  }
  return res.json();
}

export async function authSignup(payload: { nome: string; email: string; senha: string }) {
  const res = await fetch(`${API}/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Falha no cadastro');
  return res.json();
}

export async function authLogin(payload: { email: string; senha: string }) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Falha no login');
  return res.json() as Promise<{ access_token: string; user: { id: string; nome: string; email: string } }>;
}

export async function authMe() {
  const token = getAuthToken();
  if (!token) throw new Error('Nao autenticado');

  const res = await fetch(`${API}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('Sessao invalida');
  return res.json();
}

export async function authChangePassword(payload: { senhaAtual: string; novaSenha: string }) {
  const token = getAuthToken();
  if (!token) throw new Error('Nao autenticado');

  const res = await fetch(`${API}/auth/change-password`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Falha ao trocar senha');
  return res.json();
}

export async function authRequestPasswordReset(payload: { email: string }) {
  const res = await fetch(`${API}/auth/request-password-reset`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Falha ao solicitar reset');
  return res.json();
}

export async function authResetPassword(payload: { token: string; novaSenha: string }) {
  const res = await fetch(`${API}/auth/reset-password`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Falha ao redefinir senha');
  return res.json();
}

export async function authLogout() {
  await fetch(`${API}/auth/logout`, { method: 'POST' });
  clearAuthToken();
}

export async function sportsUpload(file: File, credoresCsv = '') {
  const form = new FormData();
  form.append('file', file);
  const suffix = credoresCsv.trim() ? `?credores=${encodeURIComponent(credoresCsv)}` : '';
  const res = await fetch(`${API}/laghetto-sports/upload${suffix}`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) throw new Error('Falha no upload Laghetto Sports');
  return res.json() as Promise<{ request_id: string; flow: string }>;
}

export async function sportsStatus(requestId: string) {
  const res = await fetch(`${API}/laghetto-sports/${requestId}/status`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Falha ao consultar status Sports');
  return res.json();
}

export async function sportsLogs(requestId: string) {
  const res = await fetch(`${API}/laghetto-sports/${requestId}/logs`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Falha ao consultar logs Sports');
  return res.json();
}

export async function sportsDownload(requestId: string) {
  const res = await fetch(`${API}/laghetto-sports/${requestId}/download`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Falha no download Sports');
  return res.json() as Promise<{ request_id: string; file_name: string; content_base64: string }>;
}

export async function lgmUpload(file: File, credoresCsv = '') {
  const form = new FormData();
  form.append('file', file);
  const suffix = credoresCsv.trim() ? `?credores=${encodeURIComponent(credoresCsv)}` : '';
  const res = await fetch(`${API}/lgm/upload${suffix}`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) throw new Error('Falha no upload LGM');
  return res.json() as Promise<{ request_id: string; flow: string }>;
}

export async function lgmListArquivos(numeroPgc: string, empresa?: string) {
  const query = new URLSearchParams({ numero_pgc: numeroPgc });
  if (empresa?.trim()) query.set('empresa', empresa.trim());
  const res = await fetch(`${API}/lgm/arquivos?${query.toString()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Falha ao listar arquivos por PGC/empresa');
  return res.json() as Promise<{
    numero_pgc: string;
    empresa: string;
    total: number;
    files: Array<{
      name: string;
      relativePath: string;
      root: string;
      size: number;
      updatedAt: string;
    }>;
  }>;
}

export async function listEmpresasPagadoras(): Promise<EmpresaPagadora[]> {
  const res = await fetch(`${API}/empresas-pagadoras`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Falha ao listar empresas pagadoras');
  return res.json() as Promise<EmpresaPagadora[]>;
}

export async function lgmErrors(requestId: string) {
  const res = await fetch(`${API}/lgm/${requestId}/errors.json`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Falha ao consultar errors.json do LGM');
  return res.json();
}

export async function lgmCredores(requestId: string) {
  const res = await fetch(`${API}/lgm/${requestId}/credores.json`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Falha ao consultar credores.json do LGM');
  return res.json();
}

export async function lgmLogs(requestId: string) {
  const res = await fetch(`${API}/lgm/${requestId}/logs`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Falha ao consultar logs do LGM');
  return res.json();
}

export async function lgmDownload(requestId: string) {
  const res = await fetch(`${API}/lgm/${requestId}/download`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Falha no download final do LGM');
  return res.json() as Promise<{ request_id: string; file_name: string; content_base64: string }>;
}

export async function lgmResolveError(
  requestId: string,
  errorId: string,
  payload: { action: 'resolve' | 'ignore'; note?: string },
) {
  const res = await fetch(`${API}/lgm/${requestId}/errors/${errorId}/resolve`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Falha ao resolver erro do LGM');
  return res.json();
}
