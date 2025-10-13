-- Migration created on Aug 21, 2025
ALTER TABLE "triggers" DROP CONSTRAINT IF EXISTS "triggers_agentConfigurationId_fkey";

ALTER TABLE "triggers" ALTER COLUMN "agentConfigurationId" SET NOT NULL;
ALTER TABLE "triggers" ALTER COLUMN "agentConfigurationId" DROP DEFAULT;
ALTER TABLE "triggers" ALTER COLUMN "agentConfigurationId" TYPE VARCHAR(255);
