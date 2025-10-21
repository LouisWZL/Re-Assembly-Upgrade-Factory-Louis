-- Add dispatcher sequencing and simulation timing columns to orders
ALTER TABLE "Auftrag"
  ADD COLUMN "dispatcherOrderPreAcceptance" INTEGER,
  ADD COLUMN "dispatcherOrderPreInspection" INTEGER,
  ADD COLUMN "dispatcherOrderPostInspection" INTEGER,
  ADD COLUMN "plannedDeliverySimMinute" DOUBLE PRECISION,
  ADD COLUMN "finalCompletionSimMinute" DOUBLE PRECISION;

