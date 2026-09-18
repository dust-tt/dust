import { autoInternalMCPServerNameToSId } from "@app/lib/actions/mcp_helper";
import type { Authenticator } from "@app/lib/auth";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { GlobalSkillsRegistry } from "@app/lib/resources/skill/code_defined/global_registry";
import { SystemSkillsRegistry } from "@app/lib/resources/skill/code_defined/system_registry";
import type { SkillSearchFilters } from "@app/types/api/skills";

// Shared documents cannot store workspace-specific restrictions or tool view IDs.
export async function listCodeDefinedSearchSkillIds(
  auth: Authenticator,
  { filters = {} }: { filters?: SkillSearchFilters }
): Promise<string[]> {
  if (
    (filters.status && !filters.status.includes("active")) ||
    filters.editedByMe
  ) {
    return [];
  }
  const [globalSkills, systemSkills] = await Promise.all([
    GlobalSkillsRegistry.findAll(auth),
    SystemSkillsRegistry.findAll(auth),
  ]);
  const selectedViewIds = new Set(filters.mcpServerViewIds ?? []);
  const selectedViews =
    selectedViewIds.size > 0
      ? await MCPServerViewResource.fetchByIds(auth, [...selectedViewIds])
      : [];
  const selectedInternalServerIds = new Set(
    selectedViews
      .filter((view) => selectedViewIds.has(view.sId))
      .map((view) => view.internalMCPServerId)
  );
  const skillIds: string[] = [];
  for (const definition of [...globalSkills, ...systemSkills]) {
    const availability =
      definition.kind === "global" ? "users_and_agents" : "workspace_users";
    if (
      (filters.availability?.length &&
        !filters.availability.includes(availability)) ||
      (filters.mcpServerViewIds?.length &&
        !(definition.mcpServers ?? []).some(({ name }) =>
          selectedInternalServerIds.has(
            autoInternalMCPServerNameToSId({
              name,
              workspaceId: auth.getNonNullableWorkspace().id,
            })
          )
        ))
    ) {
      continue;
    }
    skillIds.push(definition.sId);
  }
  return skillIds.sort();
}
