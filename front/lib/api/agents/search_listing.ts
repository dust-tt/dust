import { searchAgents } from "@app/lib/api/agents/search";
import type { Authenticator } from "@app/lib/auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { TagResource } from "@app/lib/resources/tags_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import type { SearchAgentsResponseBody } from "@app/types/agent_search/agent_search";
import { Ok } from "@app/types/shared/result";
import { removeNulls } from "@app/types/shared/utils/general";

/**
 * @cc [owner:tdraier,label:security] agent-search-listing-names
 * Resolve editor, tag, skill and space names for `searchAgents` results (listed agents and facets)
 * through resources, and only name skills and spaces the caller can read: unreadable ones are
 * dropped from the facets.
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
  const facetCount = (
    values: { value: string; count: number }[] | undefined,
    id: string
  ) => values?.find(({ value }) => value === id)?.count ?? 0;
  const [users, tags, skills, spaces] = await Promise.all([
    UserResource.fetchByIds(editorIds),
    tagIds.length > 0 ? TagResource.fetchByIds(auth, tagIds) : [],
    facetValues.skills?.length
      ? SkillResource.fetchByIds(auth, facetIds(facetValues.skills), {
          withInstructions: false,
          withTools: false,
          withFileAttachments: false,
        })
      : [],
    facetValues.spaces?.length
      ? SpaceResource.fetchByIds(auth, facetIds(facetValues.spaces))
      : [],
  ]);

  const editorsById = new Map(
    users.map((user) => {
      const { sId, fullName, image } = user.toJSON();
      return [sId, { sId, fullName, image }];
    })
  );

  const usersById = new Map(users.map((user) => [user.sId, user]));
  const tagsById = new Map(tags.map((tag) => [tag.sId, tag]));

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
              .map((skill) =>
                skill.toSearchFacetJSON(
                  facetCount(facetValues.skills, skill.sId)
                )
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
                space.toSearchFacetJSON(
                  facetCount(facetValues.spaces, space.sId)
                )
              )
              .toSorted((a, b) => a.name.localeCompare(b.name)),
          }
        : {}),
      ...(facetValues.usage ? { usage: facetValues.usage } : {}),
    },
    agents: result.value.agents.map((agent) => ({
      ...agent,
      editors: removeNulls(
        [...new Set(agent.editorIds)].map((id) => editorsById.get(id))
      ),
      tags: removeNulls(
        agent.tagIds.map((id) => tagsById.get(id)?.toJSON())
      ).toSorted((a, b) => a.name.localeCompare(b.name)),
    })),
  });
}
