-- Admin Governance §1A: single table backing all group permission grants (resource-level access
-- and workspace-level capabilities). See front/types/group_permissions.ts for the vocabulary and
-- lib/resources/group_permission_registry.ts for validity rules.
SET lock_timeout = '5s';

CREATE TABLE "public"."group_permissions"
(
  "createdAt"      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedAt"      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "workspaceId"    BIGINT       NOT NULL REFERENCES "public"."workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "groupId"        BIGINT       NOT NULL REFERENCES "public"."groups" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "permissionType" VARCHAR(256) NOT NULL,
  "resourceType"   VARCHAR(256) NOT NULL,
  -- Resource ModelId, or -1 for "the type as a whole" (no NULL: one meaning, one representation).
  "resourceId"     BIGINT       NOT NULL,
  "id"             BIGSERIAL,
  PRIMARY KEY ("id"),
  -- Instance-less domains and the "all types" wildcard only make sense at the type level.
  -- Finer per-verb rules (e.g. "create" ⇒ -1) live in the code registry, not here.
  CONSTRAINT "group_permissions_instanceless_resource_id_check"
    CHECK ("resourceId" = -1 OR "resourceType" NOT IN ('billing', 'identity', 'audit_log', '*'))
);

-- Dedupes grants and covers the "does this group have this grant" direction.
CREATE UNIQUE INDEX CONCURRENTLY "group_permissions_ws_group_ptype_rtype_rid_unique"
  ON "public"."group_permissions" ("workspaceId", "groupId", "permissionType", "resourceType", "resourceId");

-- "who can act on resource X" direction.
CREATE INDEX CONCURRENTLY "group_permissions_ws_rtype_rid"
  ON "public"."group_permissions" ("workspaceId", "resourceType", "resourceId");

-- FK index (BACK13): groups are deletable, avoid a table scan on group deletion.
CREATE INDEX CONCURRENTLY "group_permissions_group_id"
  ON "public"."group_permissions" ("groupId");
