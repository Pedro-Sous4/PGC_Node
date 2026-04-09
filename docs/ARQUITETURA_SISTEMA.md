# ARQUITETURA_SISTEMA

## 1. VISÃO GERAL DO SISTEMA

- Esse repositório é a nova implementação do processamento de planilhas PGC (Plano de Gestão de Comissionamento) criado para substituir um legado Django, com arquitetura monorepo.
- Resolve o problema de ingestão de arquivos PGC/Laghetto (SPORTS/LGM) no processo de distribuição de comissões, aplicando regras de mínimo garantido, descontos e geração de artefatos (XLSX/ZIP/PDF) para credores.
- Fluxo macro:
  1. Upload do arquivo (API REST `POST /jobs/pgc/upload`, `POST /lgm/upload`, `POST /laghetto-sports/upload`)
  2. Enfileiramento em Redis/BullMQ (`QueueService.enqueueProcessing`)
  3. Worker processa (BullMQ worker em `apps/worker`): busca workbook, parse, normalizações, cálculo mínimo/desconto, gera arquivos por credor e zip de saída
  4. Persistência de estado em PostgreSQL via Prisma (`ProcessingJob`, `ProcessingStep`, `CredorProcessingStatus`, `ProcessingError`, `ProcessingArtifact`)
  5. Exposição de progresso via SSE (`GET /jobs/:requestId/stream`) e endpoints de consulta (`/status`, `/errors`, `/credores`, `/artifacts`)
  6. Envio de e-mails (módulo `apps/api/src/modules/emails`) com templates configuráveis e log de tentativas

---

## 2. ARQUITETURA ATUAL

- Tecnologias:
  - Backend: Node.js 20, NestJS, TypeScript, Prisma, PostgreSQL, Redis, BullMQ, Pino, OpenTelemetry, Prometheus
  - Worker: Node.js, BullMQ, XLSX (`xlsx`), JSZip, undici para cham. HTTP internals
  - Frontend: Next.js App Router, React, TypeScript, TanStack Query, SSE
  - Storage temporário e artifacts: arquivos em disco (`/PGC`, `/artifacts`, `.runtime`), MinIO (dev) via infra config

- Comunicação frontend/backend:
  - REST API em `apps/api/src/modules/*`
  - SSE `jobs/:requestId/stream` para status em tempo real (JobStateStore)
  - Uploads: API recebe arquivo e guarda local em `artifacts/(sports|lgm)/requestId` e/ou `PGC/(SPORTS|LGM)/numeroPgc`

- Estrutura de pastas resumida:
  - `/apps/api`: NestJS, controllers, services, DTOs, módulos, infra (Prisma/Redis/Queue)
  - `/apps/worker`: BullMQ worker para processamento PGC com lógica de planilha e geração de artefatos
  - `/apps/web`: Next.js + UI para dashboard, upload e monitoramento de jobs
  - `/packages/contracts/domain/shared`: contratos TypeScript compartilhados
  - `/prisma`: schema do banco
  - `/docs`: requisitos, guias e relatórios de evolução

---

## 3. FLUXO PRINCIPAL (PASSO A PASSO)

1. Upload da planilha PGC
   - `POST /jobs/pgc/upload` chama `JobsService.createUploadJob` com DTO `flow` (classic/lgm/laghetto-sports) e lista opcional de credores.
   - Cria `ProcessingJob` no banco e adiciona tarefa no BullMQ (`pgc-processing`).
   - Para flows específicos, endpoints `lgm/upload` e `laghetto-sports/upload` gravam o arquivo em disco e chamam `createUploadJob`.

2. Leitura das abas
   - Worker (`apps/worker/src/queues/processing.worker.ts`) resolve arquivo por requestId/flow em `resolveInputWorkbook` (varre `artifacts/sports`, `artifacts/lgm`).
   - Workbook lido com `XLSX.read(buffer)`.
   - Determina as abas:
     - `pgcSheetName`: `findSheetName(sheetNames, /\bpgc\b/)` ou `.../principal|base\s*pgc/`
     - `baseSheetName`: `findSheetName(sheetNames, /\bbase\b/)`
     - `extratoSheetName`: `findSheetName(sheetNames, /\bextrato\b/)` (opcional)
     - `produtividadeSheetName`: `findSheetName(sheetNames, /produtividade|\bprod\b/)` (opcional)

3. BASE PGC
   - `parseTabularSheet` lê tabela com detecção de linha de cabeçalho (`detectHeaderRow`), normaliza cabeçalhos (`buildUniqueHeaders`) e extrai records.
   - Detecta automática coluna de `credor` / `cnpj` via `detectColumn` heurística e fallback por conteúdo.

4. EXTRATO / PRODUTIVIDADE
   - Mesma função `parseTabularSheet` (records/table). Abas opcionais não são obrigatórias; ausência gera warning no progresso.

5. PGC (mínimo)
   - `deriveMinimoRecords` combina:
     - `deriveMinimoRecordsFromLegacyLayout` (layout 