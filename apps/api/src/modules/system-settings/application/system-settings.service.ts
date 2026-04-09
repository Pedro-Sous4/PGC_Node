import { BadRequestException, Injectable } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import nodemailer from 'nodemailer';
import { UpdateSystemSettingsDto } from '../dto/update-system-settings.dto';

export type SystemSettings = {
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
    history: Array<{
      at: string;
      by: string;
      changes: string[];
    }>;
  };
};

const DEFAULT_SETTINGS: SystemSettings = {
  email: {
    fromName: 'Financeiro PGC',
    fromAddress: process.env.EMAIL_FROM ?? '',
    replyTo: process.env.EMAIL_REPLY_TO ?? '',
    assuntoPadrao: 'PGC {historico.numero_pgc} - {historico.periodo}',
  },
  envio: {
    loteMaximoCredores: 200,
    intervaloMsEntreEnvios: 0,
    maxTentativasPorCredor: 3,
  },
  processamento: {
    timeoutMsIngestao: Number(process.env.INGESTION_TIMEOUT_MS ?? 20000),
    timeoutMsCredor: Number(process.env.CREDOR_TIMEOUT_MS ?? 30000),
    timeoutMsArtefatos: Number(process.env.ARTIFACTS_TIMEOUT_MS ?? 20000),
  },
  smtp: {
    provider: (process.env.EMAIL_PROVIDER as 'smtp' | 'sendgrid-smtp' | undefined) ?? 'smtp',
    host: process.env.SMTP_HOST ?? 'smtp.office365.com',
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: String(process.env.SMTP_SECURE ?? 'false').toLowerCase() === 'true',
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    sendgridApiKey: process.env.SENDGRID_API_KEY ?? '',
    testTo: process.env.SMTP_TEST_TO ?? process.env.EMAIL_REPLY_TO ?? process.env.EMAIL_FROM ?? '',
  },
  empresasCnpj: [
    { empresa: 'RESERVA DOS VINHEDOS INCORPORADORA SPE LTDA', cnpj: '34.028.040/0003-25' },
    { empresa: 'ALTOS DA BORGES EMPREENDIMENTOS IMOBILIARIOS LTDA', cnpj: '40.024.035/0001-85' },
    { empresa: 'LGM PARTICIPACOES LTDA | FILIAL PEDRAS ALTAS', cnpj: '48.896.217/0024-44' },
    { empresa: 'GVP PARTICIPACOES E INVESTIMENTOS LTDA', cnpj: '17.991.041/0001-90' },
    { empresa: 'GOLDEN LAGHETTO EMPREENDIMENTOS IMOBILIARIOS SPE LTD', cnpj: '23.585.934/0003-08' },
    { empresa: 'ATHIVABRASIL EMPREENDIMENTOS IMOBILIARIOS LTDA', cnpj: '08.705.893/0001-82' },
    { empresa: 'CANELA EMPREENDIMENTOS IMOBILIARIOS LTDA', cnpj: '30.145.972/0002-16' },
    { empresa: 'ASA DELTA EMPREENDIMENTOS IMOBILIARIOS LTDA', cnpj: '30.182.622/0004-91' },
    { empresa: 'LGM PARTICIPACOES LTDA | FILIAL BORGES', cnpj: '48.896.217/0004-09' },
    { empresa: 'LSRG RESORT SPE LTDA SCP', cnpj: '49.850.335/0001-98' },
    { empresa: 'SCI RESORT SPE LTDA SCP', cnpj: '49.729.088/0001-76' },
    { empresa: 'JPZ EMPREENDIMENTOS LTDA', cnpj: '48.896.217/0024-44' },
  ],
  audit: {
    updatedAt: new Date(0).toISOString(),
    updatedBy: 'system',
    changeCount: 0,
    history: [],
  },
};

@Injectable()
export class SystemSettingsService {
  private get settingsPath() {
    return path.join(process.cwd(), '.runtime', 'system-settings.json');
  }

  async getSettings(): Promise<SystemSettings> {
    try {
      const content = await fs.readFile(this.settingsPath, 'utf8');
      const parsed = JSON.parse(content) as Partial<SystemSettings>;
      return {
        email: {
          ...DEFAULT_SETTINGS.email,
          ...(parsed.email ?? {}),
        },
        envio: {
          ...DEFAULT_SETTINGS.envio,
          ...(parsed.envio ?? {}),
        },
        processamento: {
          ...DEFAULT_SETTINGS.processamento,
          ...(parsed.processamento ?? {}),
        },
        smtp: {
          ...DEFAULT_SETTINGS.smtp,
          ...(parsed.smtp ?? {}),
        },
        empresasCnpj: Array.isArray(parsed.empresasCnpj)
          ? parsed.empresasCnpj
              .map((item) => ({
                empresa: String((item as { empresa?: string }).empresa ?? '').trim(),
                cnpj: String((item as { cnpj?: string }).cnpj ?? '').trim(),
              }))
              .filter((item) => item.empresa && item.cnpj)
          : DEFAULT_SETTINGS.empresasCnpj,
        audit: {
          ...DEFAULT_SETTINGS.audit,
          ...(parsed.audit ?? {}),
          history: parsed.audit?.history ?? DEFAULT_SETTINGS.audit.history,
        },
      };
    } catch {
      return DEFAULT_SETTINGS;
    }
  }

  async updateSettings(dto: UpdateSystemSettingsDto): Promise<SystemSettings> {
    const current = await this.getSettings();
    const now = new Date().toISOString();
    const actor = dto.auditActor?.trim() || 'unknown';
    const changes: string[] = [];

    if (dto.email) changes.push('email');
    if (dto.envio) changes.push('envio');
    if (dto.processamento) changes.push('processamento');
    if (dto.smtp) changes.push('smtp');
    if (dto.empresasCnpj) changes.push('empresasCnpj');

    const rawSmtp = dto.smtp ?? {};
    const nextSmtp = {
      ...current.smtp,
      ...rawSmtp,
    };

    if (nextSmtp.provider === 'sendgrid-smtp') {
      const apiKey = rawSmtp.sendgridApiKey?.trim() || nextSmtp.sendgridApiKey.trim();
      nextSmtp.host = 'smtp.sendgrid.net';
      nextSmtp.port = 587;
      nextSmtp.secure = false;
      nextSmtp.user = 'apikey';
      nextSmtp.pass = apiKey;
      nextSmtp.sendgridApiKey = apiKey;
    }

    const nextHistory = [{ at: now, by: actor, changes }, ...current.audit.history].slice(0, 100);
    const nextEmpresasCnpj = Array.isArray(dto.empresasCnpj)
      ? dto.empresasCnpj
          .map((item) => ({
            empresa: String(item?.empresa ?? '').trim(),
            cnpj: String(item?.cnpj ?? '').trim(),
          }))
          .filter((item) => item.empresa && item.cnpj)
      : current.empresasCnpj;

    const next: SystemSettings = {
      email: {
        ...current.email,
        ...(dto.email ?? {}),
      },
      envio: {
        ...current.envio,
        ...(dto.envio ?? {}),
      },
      processamento: {
        ...current.processamento,
        ...(dto.processamento ?? {}),
      },
      smtp: nextSmtp,
      empresasCnpj: nextEmpresasCnpj,
      audit: {
        updatedAt: now,
        updatedBy: actor,
        changeCount: current.audit.changeCount + 1,
        history: nextHistory,
      },
    };

    await fs.mkdir(path.dirname(this.settingsPath), { recursive: true });
    await fs.writeFile(this.settingsPath, JSON.stringify(next, null, 2), 'utf8');
    return next;
  }

  async sendTestEmail(to?: string) {
    const settings = await this.getSettings();
    const toAddress = String(to ?? settings.smtp.testTo ?? settings.email.replyTo ?? settings.email.fromAddress).trim();
    if (!toAddress) {
      throw new BadRequestException('Informe um e-mail de destino para teste.');
    }

    if (!settings.smtp.host?.trim()) {
      throw new BadRequestException('Host SMTP nao configurado.');
    }

    if (!settings.smtp.port || !Number.isFinite(Number(settings.smtp.port))) {
      throw new BadRequestException('Porta SMTP invalida.');
    }

    if (!settings.email.fromAddress?.trim()) {
      throw new BadRequestException('E-mail de disparo nao configurado.');
    }

    const transporter = nodemailer.createTransport({
      host: settings.smtp.host,
      port: settings.smtp.port,
      secure: settings.smtp.secure,
      auth: settings.smtp.user && settings.smtp.pass ? { user: settings.smtp.user, pass: settings.smtp.pass } : undefined,
    });

    let info: { messageId: string };
    try {
      await transporter.verify();
      const fromLabel = settings.email.fromAddress
        ? `${settings.email.fromName} <${settings.email.fromAddress}>`
        : settings.email.fromName;

      info = await transporter.sendMail({
        from: fromLabel,
        to: toAddress,
        replyTo: settings.email.replyTo || undefined,
        subject: '[PGC] Teste de remetente configurado',
        text: 'Este e-mail confirma que o remetente e o SMTP do sistema PGC foram configurados com sucesso.',
      });
    } catch (error) {
      const message = String((error as Error)?.message ?? 'Falha ao testar remetente SMTP.');

      if (/ENOTFOUND/i.test(message)) {
        throw new BadRequestException(`Host SMTP invalido ou nao resolvido: ${settings.smtp.host}.`);
      }

      if (/wrong version number|ssl routines/i.test(message)) {
        throw new BadRequestException('Falha de TLS/SSL. Verifique porta e opcao de conexao segura (SSL/TLS).');
      }

      if (/auth|535|invalid login|username|password/i.test(message)) {
        throw new BadRequestException('Falha de autenticacao SMTP. Verifique usuario e senha/API key.');
      }

      throw new BadRequestException(`Falha ao testar SMTP: ${message}`);
    }

    return {
      ok: true,
      to: toAddress,
      messageId: info.messageId,
    };
  }
}
