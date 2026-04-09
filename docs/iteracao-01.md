# Iteracao 01 - Fundacao Arquitetural

## Objetivo da iteracao

Entregar base operacional para evolucao por fases sem retrabalho: monorepo, API NestJS, worker BullMQ, frontend Next.js e infraestrutura local.

## Cobertura do prompt

### Entregue nesta iteracao

- Stack obrigatoria inicial aplicada
- Arquitetura modular por apps/packages
- Filas BullMQ: `pgc-processing`, `email-dispatch`, `report-generation`
- API minima obrigatoria de jobs + operacional
- Processamento assincrono fora da thread HTTP
- SSE para progresso em tempo real na UI
- Modelo de dados alvo inicial em Prisma
- Base de observabilidade (Pino + metrics + OTEL bootstrap)

### Parcial nesta iteracao

- Modulos de dominio completos (auth/credor/rendimento/historico/email/admin-ops)
- Persistencia real de status/erros/artefatos no Postgres (atualmente store em memoria para status online)
- Locks Redis por `request_id`, DLQ e cancelamento hard real
- Exportacoes PDF/CSV/XLSX/ZIP reais
- Envio de email real e tracking persistido por item
- Testes automatizados (unit/integration/e2e/load)

## Regras criticas preservadas (base)

- Falha de um credor nao interrompe job global (worker simulado)
- Status por credor com estados `PENDING|PROCESSING|SUCCESS|ERROR`
- Reprocessamento seletivo por subset de credores
- `request_id` gerado no inicio do upload

## Trade-offs da iteracao

- Para acelerar entrega de base, status de progresso esta em memoria na API.
- O schema Prisma ja contem entidades e constraints de idempotencia para migrar estado para banco na proxima fase.

## Proxima iteracao recomendada

- Persistir `ProcessingJob`, `ProcessingStep`, `CredorProcessingStatus`, `ProcessingError`, `ProcessingArtifact`
- Implementar lock Redis por request_id e cancelamento cooperativo
- Substituir simulacao por pipeline real de ingestion/minimo/descontos por credor
- Incluir testes e benchmark de tempo por credor
