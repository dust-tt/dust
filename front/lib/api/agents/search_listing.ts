import { searchAgents } from "@app/lib/api/agents/search";
import type { Authenticator } from "@app/lib/auth";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { TagResource } from "@app/lib/resources/tags_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import type { SearchAgentsResponseBody } from "@app/types/agent_search/agent_search";
import { isSkillVisibleToViewer } from "@app/types/assistant/skill_configuration_constants";
import { Ok } from "@app/types/shared/result";
import { removeNulls } from "@app/types/shared/utils/general";

/**
 * @cc [owner:aubin-tchoi,label:security] agent-search-listing-names
 * Resolve editor, tag, skill, space and tool names for `searchAgents` results (listed agents and
 * facets) through resources, and only name skills, spaces and tools the caller can read: unreadable
 * ones are dropped from the facets. Editors-only skills are only named for callers who can write
 * to them.
 */
/**
 * @cc [owner:adrsimon,label:product] agent-search-listing-favorite
 * Each listed agent MUST carry `userFavorite`, true iff the agent is in the calling user's
 * favorites, regardless of the selection mode; it is false for every agent when there is no
 * calling user.
 */
export async function searchAgentListings(
  auth: Authenticator,
  options: Parameters<typeof searchAgents>[1]
) {
  const result = await searchAgents(auth, options);
  if (result.isErr()) {
    return result;
  }

  const { facets: facetValues } = result.value;
  const editorIds = [
    ...new Set([
      ...result.value.agents.flatMap((agent) => agent.editorIds),
      ...(facetValues.editors ?? []).map(({ value }) => value),
    ]),
  ];
  const facetIds = (values: { value: string }[] | undefined) =>
    (values ?? []).map(({ value }) => value);
  // Tags are resolved once for both the listed agents and the tag facet.
  const tagIds = [
    ...new Set([
      ...result.value.agents.flatMap((agent) => agent.tagIds),
      ...facetIds(facetValues.tags),
    ]),
  ];
  const facetCountsById = (
    values: { value: string; count: number }[] | undefined
  ) => new Map((values ?? []).map(({ value, count }) => [value, count]));
  const users = await UserResource.fetchByIds(editorIds);
  const tags = await TagResource.fetchByIds(auth, tagIds);
  const skills = await SkillResource.fetchByIds(
    auth,
    facetIds(facetValues.skills),
    {
      withInstructions: false,
      withTools: false,
      withFileAttachments: false,
    }
  );
  const spaces = await SpaceResource.fetchByIds(
    auth,
    facetIds(facetValues.spaces)
  );
  const mcpServerViews = await MCPServerViewResource.fetchByIds(
    auth,
    facetIds(facetValues.mcpServerViews)
  );
  const favoriteIds = await AgentResource.listFavoriteIdsForCurrentUser(auth);

  const favoriteIdSet = new Set(favoriteIds);
  const editorsById = new Map(
    users.map((user) => {
      const { sId, fullName, image } = user.toJSON();
      return [sId, { sId, fullName, image }];
    })
  );

  const usersById = new Map(users.map((user) => [user.sId, user]));
  const tagsById = new Map(tags.map((tag) => [tag.sId, tag]));
  const skillCounts = facetCountsById(facetValues.skills);
  const spaceCounts = facetCountsById(facetValues.spaces);
  const mcpServerViewCounts = facetCountsById(facetValues.mcpServerViews);

  return new Ok<SearchAgentsResponseBody>({
    ...result.value,
    facets: {
      ...(facetValues.editors
        ? {
            editors: facetValues.editors
              .flatMap(({ value, count }) => {
                const editor = usersById.get(value);
                return editor ? [editor.toSearchFacetJSON(count)] : [];
              })
              .toSorted((a, b) => a.fullName.localeCompare(b.fullName)),
          }
        : {}),
      ...(facetValues.models
        ? {
            models: facetValues.models.map(({ value, count }) => ({
              modelId: value,
              count,
            })),
          }
        : {}),
      ...(facetValues.tags
        ? {
            tags: facetValues.tags
              .flatMap(({ value, count }) => {
                const tag = tagsById.get(value);
                return tag ? [tag.toSearchFacetJSON(count)] : [];
              })
              .toSorted((a, b) => a.name.localeCompare(b.name)),
          }
        : {}),
      ...(facetValues.skills
        ? {
            skills: skills
              .filter((skill) =>
                isSkillVisibleToViewer({
                  availability: skill.availability,
                  viewerCanWrite: auth.can("write", skill),
                })
              )
              .map((skill) =>
                skill.toSearchFacetJSON(skillCounts.get(skill.sId) ?? 0)
              )
              .toSorted((a, b) => a.name.localeCompare(b.name)),
          }
        : {}),
      ...(facetValues.spaces
        ? {
            // Unrestricted search can surface spaces the caller cannot read: never name them.
            spaces: spaces
              .filter((space) => auth.can("read", space))
              .map((space) =>
                space.toSearchFacetJSON(spaceCounts.get(space.sId) ?? 0)
              )
              .toSorted((a, b) => a.name.localeCompare(b.name)),
          }
        : {}),
      ...(facetValues.mcpServerViews
        ? {
            mcpServerViews: mcpServerViews
              .filter((view) => auth.can("read", view))
              .map((view) =>
                view.toSearchFacetJSON(mcpServerViewCounts.get(view.sId) ?? 0)
              )
              .toSorted((a, b) => a.name.localeCompare(b.name)),
          }
        : {}),
      ...(facetValues.usage ? { usage: facetValues.usage } : {}),
    },
    agents: result.value.agents.map((agent) => ({
      ...agent,
      userFavorite: favoriteIdSet.has(agent.sId),
      editors: removeNulls(
        [...new Set(agent.editorIds)].map((id) => editorsById.get(id))
      ),
      tags: removeNulls(
        agent.tagIds.map((id) => tagsById.get(id)?.toJSON())
      ).toSorted((a, b) => a.name.localeCompare(b.name)),
    })),
  });
}
