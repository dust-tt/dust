import { fetchMCPServerActionConfigurations } from "@app/lib/actions/configuration/mcp";
import { getFavoriteStates } from "@app/lib/api/assistant/get_favorite_states";
import type { Authenticator } from "@app/lib/auth";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { tagsSorter } from "@app/lib/utils";
import type {
  AgentActionsEnrichment,
  AgentConfigurationType,
  AgentFavoriteEnrichment,
  AgentTagsEnrichment,
  LightAgentConfigurationType,
} from "@app/types/assistant/agent";
import type { ModelId } from "@app/types/shared/model_id";

// The `enrichWith*` steps below turn statically-loaded `AgentResource`s (their `toJSON` base) into
// full/light configuration types. `toJSON` already carries every synchronously-available field,
// including the caller's `canRead`/`canEdit` (resolved at load time); each step here adds one field
// that needs a query. They have no dependency on one another, so `toLightAgentConfigurations`/
// `toAgentConfigurations` fan them out in parallel and shallow-merge by a documented key —
// composition is parallel + merge, not a pipe.
//
// Precondition for every step and both builders: `resources` are readable custom agents rendered as
// `full` resources (`toJSON`/`content` throw otherwise). Global agents are synthesized elsewhere
// (`getGlobalAgents`) and must not be passed here.

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
 * @cc [owner:tdraier,label:backend] enrich-tags-key-per-version
 * `enrichWithTags` keys its result by the configuration-row id (`toJSON().id`): tags are attached to
 * a specific configuration version, so keying by `sId` would collide across versions.
 */
export async function enrichWithTags(
  auth: Authenticator,
  resources: AgentResource[]
): Promise<Map<ModelId, AgentTagsEnrichment>> {
  const tagsByConfigurationModelId = await AgentResource.batchListTags(
    auth,
    resources
  );

  return new Map(
    [...tagsByConfigurationModelId].map(([id, tags]) => [
      id,
      { tags: tags.map((tag) => tag.toJSON()).sort(tagsSorter) },
    ])
  );
}

/**
 * @cc [owner:tdraier,label:backend] enrich-actions-key-per-version
 * `enrichWithActions` keys its result by the configuration-row id (`toJSON().id`): a version's tools
 * belong to that configuration row, not to the agent across versions.
 */
export async function enrichWithActions(
  auth: Authenticator,
  resources: AgentResource[]
): Promise<Map<ModelId, AgentActionsEnrichment>> {
  const configurationModelIds = resources.map(
    (resource) => resource.agentConfigurationModelId
  );
  const actionsById = await fetchMCPServerActionConfigurations(auth, {
    configurationModelIds,
    variant: "full",
  });

  return new Map(
    configurationModelIds.map((id) => [
      id,
      { actions: actionsById.get(id) ?? [] },
    ])
  );
}

/**
 * Renders `LightAgentConfigurationType`s from statically-loaded `AgentResource`s: the `toJSON` base
 * (which already carries `canRead`/`canEdit`) decorated with the queried `userFavorite` and `tags`.
 * The two independent steps run in parallel and merge by key.
 */
export async function toLightAgentConfigurations(
  auth: Authenticator,
  resources: AgentResource[]
): Promise<LightAgentConfigurationType[]> {
  const bases = resources.map((resource) => resource.toJSON());

  const [favorites, tags] = await Promise.all([
    enrichWithFavorites(auth, resources),
    enrichWithTags(auth, resources),
  ]);

  return bases.map((base) => ({
    ...base,
    ...(favorites.get(base.sId) ?? { userFavorite: false }),
    ...(tags.get(base.id) ?? { tags: [] }),
  }));
}

/**
 * Renders full `AgentConfigurationType`s: the light shape plus the full-only `instructionsHtml`
 * (sync, from `content`) and `actions` (batched). Same parallel-and-merge composition as the light
 * builder, with `enrichWithActions` added to the fan-out.
 */
export async function toAgentConfigurations(
  auth: Authenticator,
  resources: AgentResource[]
): Promise<AgentConfigurationType[]> {
  const bases = resources.map((resource) => resource.toJSON());

  const [favorites, tags, actions] = await Promise.all([
    enrichWithFavorites(auth, resources),
    enrichWithTags(auth, resources),
    enrichWithActions(auth, resources),
  ]);

  return resources.map((resource, index) => {
    const base = bases[index];
    return {
      ...base,
      ...(favorites.get(base.sId) ?? { userFavorite: false }),
      ...(tags.get(base.id) ?? { tags: [] }),
      instructionsHtml: resource.content.instructionsHtml,
      ...(actions.get(base.id) ?? { actions: [] }),
    };
  });
}
