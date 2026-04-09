/*
  Warnings:

  - A unique constraint covering the columns `[nomeCanonico]` on the table `Credor` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Credor_nomeCanonico_idx";

-- CreateIndex
CREATE UNIQUE INDEX "Credor_nomeCanonico_key" ON "Credor"("nomeCanonico");
