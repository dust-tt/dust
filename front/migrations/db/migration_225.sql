-- Migration created on May 09, 2025
ALTER TABLE "public"."user_messages" ADD COLUMN "clientSideMCPServerIds" VARCHAR(255)[] NOT NULL DEFAULT ARRAY[]::VARCHAR(255)[];