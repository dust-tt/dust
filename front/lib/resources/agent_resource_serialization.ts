import { getFavoriteStates } from "@app/lib/api/assistant/get_favorite_states";
import { getAgentsRecentAuthors } from "@app/lib/api/assistant/recent_authors";
import type { Authenticator } from "@app/lib/auth";
import type { AgentContentEnrichment } from "@app/lib/resources/agent_resource";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { tagsSorter } from "@app/lib/utils";
import type {
  AgentActionsEnrichment,
  AgentConfigurationType,
  AgentFavoriteEnrichment,
  AgentRecentAuthors,
  AgentTagsEnrichment,
  LightAgentConfigurationType,
} from "@app/types/assistant/agent";

// The `enrichWith*` steps below each run the one query a configuration field needs, batched over
// statically-loaded `AgentResource`s. They have no dependency on one another, so
// `toLightAgentConfigurations`/`toAgentConfigurations` fan them out in parallel and hand the results
// to the resource, which shapes and redacts the JSON (see `agent-json-redaction`). Both builders
// accept any resource, custom or global, `full` or `light`.

/**
 * @cc [owner:tdraier,label:backend] enrich-favorites-key-per-agent
 * `enrichWithFavorites` keys its result by `sId`: a favorite is per-agent, not per-version, so its
 * value is shared by every version of the agent. Returns an empty map for callers without a user
 * (keys/system): favorites are per-user and undefined otherwise.
 */
export async function enrichWithFavorites(
  auth: Authenticator,
  resources: AgentResource[]
): Promise<Map<string, AgentFavoriteEnrichment>> {
  if (!auth.user()) {
    return new Map();
  }

  const states = await getFavoriteStates(auth, {
    configurationIds: resources.map((resource) => resource.sId),
  });

  return new Map(
    [...states].map(([sId, userFavorite]) => [sId, { userFavorite }])
  );
}

/**
 * @cc [owner:tdraier,label:backend] enrich-recent-authors-key-per-agent
 * `enrichWithRecentAuthors` keys its result by `sId`: recent authors are per-agent, across versions.
 * It is an opt-in route decoration (`lastAuthors`): the configuration builders never call it.
 */
export async function enrichWithRecentAuthors(
  auth: Authenticator,
  resources: AgentResource[]
): Promise<Map<string, { lastAuthors: AgentRecentAuthors }>> {
  const recentAuthors = await getAgentsRecentAuthors({
    agents: resources,
    auth,
  });

  return new Map(
    resources.map((resource, index) => [
      resource.sId,
      { lastAuthors: recentAuthors[index] },
    ])
  );
}

/**
 * @cc [owner:tdraier,label:backend] enrich-tags-key-per-version
 * `enrichWithTags` keys its result by the input resource, which is one configuration version: tags
 * are attached to a specific version, so keying by `sId` would collide across versions.
 */
export async function enrichWithTags(
  auth: Authenticator,
  resources: AgentResource[]
): Promise<Map<AgentResource, AgentTagsEnrichment>> {
  const tagsByAgent = await AgentResource.batchListTags(auth, resources);

  return new Map(
    [...tagsByAgent].map(([resource, tags]) => [
      resource,
      { tags: tags.map((tag) => tag.toJSON()).sort(tagsSorter) },
    ])
  );
}

/**
 * @cc [owner:tdraier,label:backend] enrich-actions-key-per-version
 * `enrichWithActions` keys its result by the input resource, which is one configuration version: a
 * version's tools belong to it, `sId` spans every version of an agent, and global agents share one
 * sentinel configuration id (`toJSON().id`).
 */
export async function enrichWithActions(
  auth: Authenticator,
  resources: AgentResource[]
): Promise<Map<AgentResource, AgentActionsEnrichment>> {
  const actionsByAgent = await AgentResource.batchListActions(auth, resources);

  return new Map(
    [...actionsByAgent].map(([resource, actions]) => [resource, { actions }])
  );
}

/**
 * @cc [owner:tdraier,label:backend] enrich-content-key-per-version
 * `enrichWithContent` keys its result by the input resource, which is one configuration version: the
 * instructions belong to that version. A `light` resource gets `content: null`.
 */
export async function enrichWithContent(
  resources: AgentResource[]
): Promise<Map<AgentResource, AgentContentEnrichment>> {
  const contentByAgent = await AgentResource.batchFetchContent(resources);

  return new Map(
    [...contentByAgent].map(([resource, content]) => [resource, { content }])
  );
}

/**
 * Renders `LightAgentConfigurationType`s: the queried `userFavorite` and `tags`, shaped by
 * `AgentResource.toLightConfigurationJSON`.
 */
export async function toLightAgentConfigurations(
  auth: Authenticator,
  resources: AgentResource[]
): Promise<LightAgentConfigurationType[]> {
  const [favorites, tags, contents] = await Promise.all([
    enrichWithFavorites(auth, resources),
    enrichWithTags(auth, resources),
    enrichWithContent(resources),
  ]);

  return resources.map((resource) =>
    resource.toLightConfigurationJSON({
      ...(favorites.get(resource.sId) ?? { userFavorite: false }),
      ...(tags.get(resource) ?? { tags: [] }),
      ...(contents.get(resource) ?? { content: null }),
    })
  );
}

/**
 * Renders full `AgentConfigurationType`s: the light enrichments plus the batched `actions`, shaped
 * (and redacted for a `light` resource) by `AgentResource.toConfigurationJSON`.
 */
export async function toAgentConfigurations(
  auth: Authenticator,
  resources: AgentResource[]
): Promise<AgentConfigurationType[]> {
  const [favorites, tags, actions, contents] = await Promise.all([
    enrichWithFavorites(auth, resources),
    enrichWithTags(auth, resources),
    enrichWithActions(auth, resources),
    enrichWithContent(resources),
  ]);

  return resources.map((resource) =>
    resource.toConfigurationJSON({
      ...(favorites.get(resource.sId) ?? { userFavorite: false }),
      ...(tags.get(resource) ?? { tags: [] }),
      ...(actions.get(resource) ?? { actions: [] }),
      ...(contents.get(resource) ?? { content: null }),
    })
  );
}
