-- Migration created on Apr 29, 2026
-- Add an admin toggle controlling whether sandbox-using agents may request
-- additional egress domains via the add_egress_domain tool.
ALTER TABLE "public"."workspaces"
ADD COLUMN "sandboxAllowAgentEgressRequests" BOOLEAN NOT NULL DEFAULT false;
