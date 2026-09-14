-- Same rationale as messages (20260722195624): groupId functionally determines workspaceId (a group
-- belongs to a single workspace), but the planner multiplies both selectivities and underestimates
-- the caller's grant lookup by two orders of magnitude. Functional-dependency statistics clamp the
-- pair to the narrower of the two selectivities instead of their product.
SET SESSION statement_timeout = 60000;
SET SESSION lock_timeout = 3000;
CREATE STATISTICS IF NOT EXISTS group_permissions_group_id_workspace_id_dependencies (dependencies)
  ON "groupId", "workspaceId" FROM group_permissions;
ANALYZE group_permissions;
