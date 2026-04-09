# PGC Migration Monorepo

Implementacao inicial da migracao PGC com foco em processamento assincrono, resiliencia e rastreabilidade.

## Stack

- Backend: Node.js 20+, NestJS, TypeScript strict, Prisma, PostgreSQL, Redis, BullMQ, Swagger, class-validator, Pino, OpenTelemetry (bootstrap), Prometheus
- Frontend: Next.js App Router, React, TypeScript strict, TanStack Query, SSE
- Storage: MinIO (dev) com estrategia de paths versionados por request_id

## Decisao de ORM

- ORM escolhido: **Prisma**
- Justificativa:
  - Migrations e schema versionado com alta previsibilidade
  - Tipagem forte e DX superior para contratos estaveis
  - Facilidade de garantir idempotencia por chaves unicas compostas

## Estrutura

- apps/api
- apps/worker
- apps/web
- packages/contracts
- packages/domain
- packages/shared
- prisma
- infra

## Como executar

### Comando unico (Windows)

Subir tudo (infra + migrate + api + worker + web):

```bash
npm run dev:up
```

Desligar tudo:

```bash
npm run dev:down
```

Reiniciar tudo (down + up):

```bash
npm run dev:restart
```

Status rapido do ambiente:

```bash
npm run dev:status
```

Logs consolidados (apps + docker):

```bash
npm run dev:logs
```

Logs de um servico especifico:

```bash
npm run dev:logs -- api
npm run dev:logs -- worker
npm run dev:logs -- web
npm run dev:logs -- docker
```

Seguir logs em tempo real:

```bash
npm run dev:logs -- all -Follow
```

Os processos de app sao iniciados em terminais separados e os PIDs ficam em `.runtime/dev-pids.json`.
O script usa `prisma migrate deploy` para evitar prompt interativo/locks no Windows.

1. Subir infraestrutura:

```bash
docker compose up -d
```

2. Criar `.env` na raiz com base em `.env.example`

3. Instalar dependencias:

```bash
npm install
```

4. Gerar cliente Prisma e migrar:

```bash
npm run prisma:generate
npm run prisma:migrate
```

5. Iniciar apps:

```bash
npm --workspace @pgc/api run dev
npm --workspace @pgc/worker run dev
npm --workspace @pgc/web run dev
```

## Endpoints minimos

- `POST /jobs/pgc/upload`
- `GET /jobs/:requestId/status`
- `GET /jobs/:requestId/errors`
- `GET /jobs/:requestId/credores`
- `POST /jobs/:requestId/reprocess`
- `POST /jobs/:requestId/cancel`
- `GET /jobs/:requestId/artifacts`
- `GET /health`
- `GET /ready`
- `GET /metrics`
- `GET /docs` (Swagger)

## Observabilidade

- Logs estruturados com Pino
- Endpoint `/metrics` para Prometheus
- Bootstrap OpenTelemetry habilitado por `OTEL_ENABLED=true`

## Qualidade de UI (pt-BR)

- Validação local de textos de interface: `npm run lint:ui-ptbr`
- O comando `npm run lint` também executa essa validação.
- Regras configuráveis em `scripts/ui-ptbr-rules.json`.
- Checker implementado em `scripts/check-ui-ptbr.js`.
- Workflow dedicado em `.github/workflows/ui-ptbr-check.yml`.

## Status da iteracao

- Base da Fase 1 entregue e compilando
- Pipeline assincrono funcional (API enfileira, worker processa)
- SSE de progresso funcional para UX interativa inicial

### Evolucao Iteracao 02

- Persistencia de processamento migrada para Postgres via Prisma
- Lock Redis por `request_id` para reduzir corridas em reprocesso/progresso
- Timeout/fallback por etapa e por credor no worker

Veja detalhes em `docs/iteracao-01.md` e `docs/iteracao-02.md`.
