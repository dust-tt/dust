-- Migration created on Jun 06, 2025
ALTER TABLE "public"."mcp_server_views"
ADD COLUMN "oAuthUseCase" VARCHAR(255);