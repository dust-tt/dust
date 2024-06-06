-- Migration created on Jun 06, 2024
ALTER TABLE "public"."workspaces" ADD COLUMN "whiteListedProviders" VARCHAR(255)[] DEFAULT NULL;
ALTER TABLE "public"."workspaces" ADD COLUMN "defaultEmbeddingProvider" VARCHAR(255) DEFAULT NULL;
