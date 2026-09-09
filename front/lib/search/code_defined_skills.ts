import { autoInternalMCPServerNameToSId } from "@app/lib/actions/mcp_helper";
import type { Authenticator } from "@app/lib/auth";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { GlobalSkillsRegistry } from "@app/lib/resources/skill/code_defined/global_registry";
import { SystemSkillsRegistry } from "@app/lib/resources/skill/code_defined/system_registry";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import {
  compareRankedResources,
  getResourceMatchScore,
  getSearchRankingScore,
} from "@app/lib/search/ranking";
import type { ResourceSearchEntry } from "@app/lib/search/resource_candidates";
import { readCodeDefinedSkillActiveUsers } from "@app/lib/search/usage";
import { GLOBAL_SKILL_SEARCH_ALIASES } from "@app/lib/skills/global_search_aliases";
import type { ResourceSearchOptions } from "@app/types/search";

export async function listCodeDefinedSearchSkills(
  auth: Authenticator,
  { searchTerm, mode = "autocomplete", filters = {} }: ResourceSearchOptions
): Promise<Extract<ResourceSearchEntry, { type: "skill" }>[]> {
  if (
    filters.spaceIds?.length ||
    filters.tagIds?.length ||
    filters.skillIds?.length ||
    filters.editedByMe
  ) {
    return [];
  }
  const [globalSkills, systemSkills] = await Promise.all([
    GlobalSkillsRegistry.findAll(auth),
    SystemSkillsRegistry.findAll(auth),
  ]);
  const usage =
    mode === "autocomplete"
      ? {}
      : await readCodeDefinedSkillActiveUsers(
          auth.getNonNullableWorkspace().sId
        );
  const selectedViewIds = new Set(filters.toolIds ?? []);
  const selectedViews =
    selectedViewIds.size > 0
      ? await MCPServerViewResource.fetchByIds(auth, [...selectedViewIds])
      : [];
  const selectedInternalServerIds = new Set(
    selectedViews
      .filter((view) => selectedViewIds.has(view.sId))
      .map((view) => view.internalMCPServerId)
  );
  const entries: Extract<ResourceSearchEntry, { type: "skill" }>[] = [];
  for (const definition of [...globalSkills, ...systemSkills]) {
    const availability =
      definition.kind === "global" ? "users_and_agents" : "workspace_users";
    if (
      (filters.availability?.length &&
        !filters.availability.includes(availability)) ||
      (filters.isDefault !== undefined &&
        filters.isDefault !== (availability === "users_and_agents")) ||
      (filters.toolIds?.length &&
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
    const score = getSearchRankingScore({
      mode,
      activeUsers: usage[definition.sId] ?? 0,
      matchScore: getResourceMatchScore({
        searchTerm,
        mode,
        name: definition.name,
        description: definition.userFacingDescription,
        aliases: GLOBAL_SKILL_SEARCH_ALIASES[definition.sId],
      }),
    });
    if (score <= 0) {
      continue;
    }
    // This constructor only wraps the authorized definition: no SQL, tools or prompt hydration.
    const resource = await SkillResource.fromCodeDefinedSkillForSearch(
      auth,
      definition
    );
    entries.push({ type: "skill", resource, score });
  }
  return entries.sort((a, b) =>
    compareRankedResources(
      { name: a.resource.name, sId: a.resource.sId, score: a.score },
      { name: b.resource.name, sId: b.resource.sId, score: b.score }
    )
  );
}
