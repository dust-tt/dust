-- Migration created on Apr 02, 2025
ALTER TABLE "public"."user_messages" ADD COLUMN "localMCPServers" JSONB[];
