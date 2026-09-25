// Leaf module: the skill value unions live here, with no imports, so that consumers which cannot
// depend on `skill_configuration.ts` can still reach them. That file imports `MCPServerViewSchema`
// as a runtime value for `SkillSchema.tools`, which pulls in the whole MCP graph — including
// `mcp_internal_actions/constants.ts`, which in turn loads every internal MCP server's metadata.
// An MCP server metadata file importing `skill_configuration.ts` therefore closes a cycle and
// throws at module init. `skill_configuration.ts` re-exports everything below, so existing
// importers keep their import path.

// `suggested`: a complete skill proposed to the workspace, that members can adopt as is.
// `pending`: an empty placeholder holding a conversational creation suggestion, until the
// suggestion is accepted and the skill becomes `active`.
export const SKILL_STATUSES = [
  "active",
  "archived",
  "suggested",
  "pending",
] as const;
export type SkillStatus = (typeof SKILL_STATUSES)[number];

export const SKILL_AVAILABILITIES = [
  "editors",
  "workspace_users",
  "users_and_agents",
] as const;
export type SkillAvailability = (typeof SKILL_AVAILABILITIES)[number];

export const DEFAULT_SKILL_AVAILABILITY = "editors" satisfies SkillAvailability;

// Editors-only skills are unpublished: only their editors (viewers who can write them) see them,
// admins aside. Shared by every surface that decides whether to show a skill to the viewer.
export function isSkillVisibleToViewer({
  availability,
  viewerCanWrite,
}: {
  availability: SkillAvailability;
  viewerCanWrite: boolean;
}): boolean {
  return availability !== "editors" || viewerCanWrite;
}

export const SKILL_NAME_MAX_LENGTH = 256;

export const SKILL_REINFORCEMENT_MODES = ["auto", "on", "off"] as const;
export type SkillReinforcementMode = (typeof SKILL_REINFORCEMENT_MODES)[number];
