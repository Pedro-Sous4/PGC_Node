# Iteracao 02 - Persistencia e Resiliencia

## 1) Plano da iteracao

- Migrar estado de processamento para Postgres (Prisma) sem quebrar API existente.
- Introduzir lock Redis por request_id para reduzir condicoes de corrida.
- Fortalecer worker com timeout/fallback por etapa e por credor.
- Validar compilacao do monorepo e manter UX SSE funcional.

## 2) Mudancas implementadas

### Backend API

- Persistencia real de jobs e progresso em banco no servico de jobs:
  - `ProcessingJob`
  - `ProcessingStep`
  - `CredorProcessingStatus`
  - `ProcessingError`
  - `ProcessingArtifact`
  - `ReprocessJob` + `ReprocessItem`
- Inclusao de `PrismaService` em `apps/api/src/infra/prisma.service.ts`.
- Inclusao de lock distribuido com Redis em `apps/api/src/infra/redis-lock.service.ts`.
- `JobsService` refatorado para:
  - criar job no banco na abertura do upload
  - hidratar status/erros/credores/artefatos a partir do Postgres
  - registrar progresso interno em tabela de steps
  - versionar artefatos por `request_id + type + version`
  - registrar reprocessamento seletivo com itens por credor
- `jobs.module.ts` atualizado para registrar providers de Prisma e lock.
- `QueueService` atualizado para evitar colisao de `jobId` em reprocessos sequenciais.

### Worker

- Pipeline com timeouts configuraveis por ambiente:
  - `MINIMO_TIMEOUT_MS`
  - `DESCONTOS_TIMEOUT_MS`
  - `CREDOR_TIMEOUT_MS`
- Fallback em descontos com warning estruturado e continuidade do loop de credores.
- Timeout/falha por credor nao interrompe job global; erro estruturado por credor e continuidade.
- Cancelamento cooperativo por checkpoints: worker consulta status do job entre etapas e antes de cada credor, encerrando cedo quando estado e `CANCELED`.

### Consistencia de cancelamento

- API passa a ignorar atualizacoes de progresso interno quando o job ja esta cancelado, evitando sobrescrita indevida para `PROCESSING`.

## 3) Evidencias (testes, logs, metricas)

- `npm run prisma:generate` executado com sucesso.
- `npm run build` executado com sucesso em todos os workspaces:
  - `@pgc/api`
  - `@pgc/worker`
  - `@pgc/web`
  - `@pgc/contracts`
  - `@pgc/domain`
  - `@pgc/shared`
- Frontend continua com pagina de acompanhamento em tempo real por SSE.

## 4) Riscos e trade-offs

- `currentCredor` ainda nao esta persistido em coluna dedicada; permanece como informacao efemera do stream.
- Cancelamento ainda e logico (estado `CANCELED`) sem interrupcao cooperativa ativa no worker em execucao.
- Endpoints internos de progresso ainda nao possuem autenticacao de servico para servico.
- Persistencia por etapa hoje cria linha em `ProcessingStep` por evento; pode exigir compactacao/agregacao em alto volume.

## 5) Proximos passos

- Implementar cancelamento cooperativo no worker (checkpoint por etapa/credor).
- Persistir `currentCredor` e contadores agregados para dashboard operacional mais rapido.
- Aplicar autenticacao interna (token de worker) para endpoint de progresso.
- Implementar modulo real de ingestion LGM (abas BASE/EXTRATO/PRODUTIVIDADE/PGC xx) e regras de normalizacao protegida.
- Adicionar testes de integracao para idempotencia (`request_id + credor + etapa`) e reprocessamento seletivo.
