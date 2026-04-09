-- CreateEnum
CREATE TYPE "ProcessingStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCESS', 'ERROR', 'CANCELED');

-- CreateTable
CREATE TABLE "Credor" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nomeExibivel" TEXT NOT NULL,
    "nomeCanonico" TEXT NOT NULL,
    "email" TEXT,
    "protegidoNome" BOOLEAN NOT NULL DEFAULT false,
    "protegidoEmail" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "actor" TEXT,
    "source" TEXT,

    CONSTRAINT "Credor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Grupo" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "actor" TEXT,
    "source" TEXT,

    CONSTRAINT "Grupo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmpresaPagadora" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cnpj" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "actor" TEXT,
    "source" TEXT,

    CONSTRAINT "EmpresaPagadora_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rendimento" (
    "id" TEXT NOT NULL,
    "credorId" TEXT NOT NULL,
    "referencia" TEXT NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "actor" TEXT,
    "source" TEXT,

    CONSTRAINT "Rendimento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistoricoPGC" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "credorId" TEXT,
    "evento" TEXT NOT NULL,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "actor" TEXT,
    "source" TEXT,

    CONSTRAINT "HistoricoPGC_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailLog" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "credorId" TEXT,
    "status" "ProcessingStatus" NOT NULL DEFAULT 'PENDING',
    "toEmail" TEXT NOT NULL,
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "erroTecnico" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "actor" TEXT,
    "source" TEXT,

    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessingJob" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "status" "ProcessingStatus" NOT NULL DEFAULT 'PENDING',
    "stage" TEXT NOT NULL,
    "percent" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "actor" TEXT,
    "source" TEXT,

    CONSTRAINT "ProcessingJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessingStep" (
    "id" TEXT NOT NULL,
    "processingJobId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "ProcessingStatus" NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "timeoutMs" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProcessingStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CredorProcessingStatus" (
    "id" TEXT NOT NULL,
    "processingJobId" TEXT NOT NULL,
    "credorId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "status" "ProcessingStatus" NOT NULL DEFAULT 'PENDING',
    "warning" TEXT,
    "errorMessage" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CredorProcessingStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessingError" (
    "id" TEXT NOT NULL,
    "processingJobId" TEXT NOT NULL,
    "credorSlug" TEXT,
    "code" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "technicalDetail" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessingError_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessingArtifact" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "type" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "checksum" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProcessingArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReprocessJob" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "status" "ProcessingStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReprocessJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReprocessItem" (
    "id" TEXT NOT NULL,
    "reprocessJobId" TEXT NOT NULL,
    "credorSlug" TEXT NOT NULL,
    "status" "ProcessingStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReprocessItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Credor_slug_key" ON "Credor"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Grupo_nome_key" ON "Grupo"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "EmpresaPagadora_nome_key" ON "EmpresaPagadora"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "EmpresaPagadora_cnpj_key" ON "EmpresaPagadora"("cnpj");

-- CreateIndex
CREATE INDEX "Rendimento_credorId_referencia_idx" ON "Rendimento"("credorId", "referencia");

-- CreateIndex
CREATE INDEX "HistoricoPGC_requestId_created_at_idx" ON "HistoricoPGC"("requestId", "created_at");

-- CreateIndex
CREATE INDEX "EmailLog_requestId_status_idx" ON "EmailLog"("requestId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessingJob_requestId_key" ON "ProcessingJob"("requestId");

-- CreateIndex
CREATE INDEX "ProcessingStep_processingJobId_status_idx" ON "ProcessingStep"("processingJobId", "status");

-- CreateIndex
CREATE INDEX "CredorProcessingStatus_processingJobId_status_idx" ON "CredorProcessingStatus"("processingJobId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CredorProcessingStatus_processingJobId_credorId_stage_key" ON "CredorProcessingStatus"("processingJobId", "credorId", "stage");

-- CreateIndex
CREATE INDEX "ProcessingError_processingJobId_credorSlug_idx" ON "ProcessingError"("processingJobId", "credorSlug");

-- CreateIndex
CREATE INDEX "ProcessingArtifact_requestId_idx" ON "ProcessingArtifact"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessingArtifact_requestId_type_version_key" ON "ProcessingArtifact"("requestId", "type", "version");

-- CreateIndex
CREATE INDEX "ReprocessJob_requestId_status_idx" ON "ReprocessJob"("requestId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ReprocessItem_reprocessJobId_credorSlug_key" ON "ReprocessItem"("reprocessJobId", "credorSlug");

-- AddForeignKey
ALTER TABLE "ProcessingStep" ADD CONSTRAINT "ProcessingStep_processingJobId_fkey" FOREIGN KEY ("processingJobId") REFERENCES "ProcessingJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CredorProcessingStatus" ADD CONSTRAINT "CredorProcessingStatus_processingJobId_fkey" FOREIGN KEY ("processingJobId") REFERENCES "ProcessingJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CredorProcessingStatus" ADD CONSTRAINT "CredorProcessingStatus_credorId_fkey" FOREIGN KEY ("credorId") REFERENCES "Credor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessingError" ADD CONSTRAINT "ProcessingError_processingJobId_fkey" FOREIGN KEY ("processingJobId") REFERENCES "ProcessingJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReprocessItem" ADD CONSTRAINT "ReprocessItem_reprocessJobId_fkey" FOREIGN KEY ("reprocessJobId") REFERENCES "ReprocessJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
