// Leaf module: the skill value unions live here, with no imports, so that consumers which cannot
// depend on `skill_configuration.ts` can still reach them. That file imports `MCPServerViewSchema`
// as a runtime value for `SkillSchema.tools`, which pulls in the whole MCP graph — including
// `mcp_internal_actions/constants.ts`, which in turn loads every internal MCP server's metadata.
// An MCP server metadata file importing `skill_configuration.ts` therefore closes a cycle and
// throws at module init. `skill_configuration.ts` re-exports everything below, so existing
// importers keep their import path.

export const SKILL_STATUSES = ["active", "archived", "suggested"] as const;
export type SkillStatus = (typeof SKILL_STATUSES)[number];

export const SKILL_AVAILABILITIES = [
  "editors",
  "workspace_users",
  "users_and_agents",
] as const;
export type SkillAvailability = (typeof SKILL_AVAILABILITIES)[number];

export const DEFAULT_SKILL_AVAILABILITY = "editors" satisfies SkillAvailability;
