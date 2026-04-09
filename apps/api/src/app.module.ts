import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { AuthModule } from './modules/auth/auth.module';
import { CredoresModule } from './modules/credores/credores.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { EmpresasPagadorasModule } from './modules/empresas-pagadoras/empresas-pagadoras.module';
import { EmailsModule } from './modules/emails/emails.module';
import { GruposModule } from './modules/grupos/grupos.module';
import { HistoricoPgcModule } from './modules/historico-pgc/historico-pgc.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { ProgressModule } from './modules/progress/progress.module';
import { OpsModule } from './modules/ops/ops.module';
import { RendimentosModule } from './modules/rendimentos/rendimentos.module';
import { SportsModule } from './modules/sports/sports.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { LgmModule } from './modules/lgm/lgm.module';
import { SystemSettingsModule } from './modules/system-settings/system-settings.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        transport:
          process.env.NODE_ENV === 'production'
            ? undefined
            : { target: 'pino-pretty', options: { singleLine: true } },
      },
    }),
    JobsModule,
    ProgressModule,
    OpsModule,
    AuthModule,
    GruposModule,
    CredoresModule,
    RendimentosModule,
    HistoricoPgcModule,
    EmpresasPagadorasModule,
    UploadsModule,
    DashboardModule,
    EmailsModule,
    SystemSettingsModule,
    SportsModule,
    LgmModule,
  ],
})
export class AppModule {}
