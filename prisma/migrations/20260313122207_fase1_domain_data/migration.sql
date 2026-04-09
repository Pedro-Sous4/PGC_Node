/*
  Warnings:

  - A unique constraint covering the columns `[nome_curto]` on the table `EmpresaPagadora` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `nome_completo` to the `EmpresaPagadora` table without a default value. This is not possible if the table is not empty.
  - Added the required column `nome_curto` to the `EmpresaPagadora` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Credor" ADD COLUMN     "data_envio" TIMESTAMP(3),
ADD COLUMN     "enviado" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "grupoId" TEXT,
ADD COLUMN     "periodo" TEXT;

-- AlterTable
ALTER TABLE "EmailLog" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "error_message" TEXT,
ADD COLUMN     "last_attempt_at" TIMESTAMP(3),
ADD COLUMN     "sent_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "EmpresaPagadora" ADD COLUMN     "nome_completo" TEXT NOT NULL,
ADD COLUMN     "nome_curto" TEXT NOT NULL,
ALTER COLUMN "nome" DROP NOT NULL;

-- AlterTable
ALTER TABLE "HistoricoPGC" ADD COLUMN     "numero_pgc" TEXT,
ADD COLUMN     "periodo" TEXT,
ADD COLUMN     "valorTotal" DECIMAL(18,2);

-- AlterTable
ALTER TABLE "Rendimento" ADD COLUMN     "numero_pgc" TEXT;

-- CreateIndex
CREATE INDEX "Credor_grupoId_idx" ON "Credor"("grupoId");

-- CreateIndex
CREATE INDEX "Credor_nomeCanonico_idx" ON "Credor"("nomeCanonico");

-- CreateIndex
CREATE INDEX "Credor_enviado_idx" ON "Credor"("enviado");

-- CreateIndex
CREATE UNIQUE INDEX "EmpresaPagadora_nome_curto_key" ON "EmpresaPagadora"("nome_curto");

-- CreateIndex
CREATE INDEX "HistoricoPGC_credorId_numero_pgc_periodo_idx" ON "HistoricoPGC"("credorId", "numero_pgc", "periodo");

-- CreateIndex
CREATE INDEX "Rendimento_credorId_numero_pgc_idx" ON "Rendimento"("credorId", "numero_pgc");

-- AddForeignKey
ALTER TABLE "Credor" ADD CONSTRAINT "Credor_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "Grupo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rendimento" ADD CONSTRAINT "Rendimento_credorId_fkey" FOREIGN KEY ("credorId") REFERENCES "Credor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricoPGC" ADD CONSTRAINT "HistoricoPGC_credorId_fkey" FOREIGN KEY ("credorId") REFERENCES "Credor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_credorId_fkey" FOREIGN KEY ("credorId") REFERENCES "Credor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
