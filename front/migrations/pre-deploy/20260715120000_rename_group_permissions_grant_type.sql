-- Admin Governance: rename group_permissions."permissionType" -> "grantType" ahead of the
-- role-backed permissions model (a grant row will store a registry-defined grant type, not a plain
-- verb). Mechanical rename only; values are unchanged by this migration. The sole live consumer is
-- the model-tier feature (lib/resources/models_tier_resource.ts), whose code ships in lockstep.

/*
Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."group_permissions" RENAME COLUMN "permissionType" TO "grantType";

/*
Statement 1
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER INDEX "public"."group_permissions_group_ptype_rtype_rid_unique" RENAME TO "group_permissions_group_gtype_rtype_rid_unique";
