ALTER TABLE "triggers"
ADD COLUMN "monitorBaseline" JSONB;

ALTER TABLE "triggers"
ADD COLUMN "monitorLastCheckedAt" TIMESTAMP WITH TIME ZONE;
