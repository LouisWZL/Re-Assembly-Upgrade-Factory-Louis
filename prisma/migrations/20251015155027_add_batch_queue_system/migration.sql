-- AlterTable
ALTER TABLE "QueueConfig" ADD COLUMN "postInspectionBatchStartSimMinute" INTEGER;
ALTER TABLE "QueueConfig" ADD COLUMN "postInspectionPythonScript" TEXT;
ALTER TABLE "QueueConfig" ADD COLUMN "preAcceptanceBatchStartSimMinute" INTEGER;
ALTER TABLE "QueueConfig" ADD COLUMN "preAcceptancePythonScript" TEXT;
ALTER TABLE "QueueConfig" ADD COLUMN "preInspectionBatchStartSimMinute" INTEGER;
ALTER TABLE "QueueConfig" ADD COLUMN "preInspectionPythonScript" TEXT;
