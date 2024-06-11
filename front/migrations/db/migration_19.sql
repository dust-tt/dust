-- Migration created on Jun 11, 2024
ALTER TABLE "public"."agent_configurations" ADD COLUMN "templateId" INTEGER REFERENCES "templates" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
