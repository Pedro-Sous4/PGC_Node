-- AlterTable
ALTER TABLE "ProcessingError" ADD COLUMN     "ignoredAt" TIMESTAMP(3),
ADD COLUMN     "resolutionAction" TEXT,
ADD COLUMN     "resolutionNote" TEXT,
ADD COLUMN     "resolvedAt" TIMESTAMP(3);
