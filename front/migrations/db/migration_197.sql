-- Migration created on Apr 02, 2025
ALTER TABLE "public"."user_messages" ADD COLUMN "localMCPServerIds" VARCHAR(255)[] NOT NULL DEFAULT ARRAY[]::VARCHAR(255)[];
