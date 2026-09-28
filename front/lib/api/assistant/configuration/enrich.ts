import { getFavoriteStates } from "@app/lib/api/assistant/get_favorite_states";
import { getAgentsRecentAuthors } from "@app/lib/api/assistant/recent_authors";
import type { Authenticator } from "@app/lib/auth";
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
import type { ModelId } from "@app/types/shared/model_id";

// The `enrichWith*` steps below turn statically-loaded `AgentResource`s (their `toJSON` base) into
// full/light configuration types. `toJSON` already carries every synchronously-available field,
// including the caller's `canRead`/`canEdit` (resolved at load time); each step here adds one field
// that needs a query. They have no dependency on one another, so `toLightAgentConfigurations`/
// `toAgentConfigurations` fan them out in parallel and shallow-merge by a documented key —
// composition is parallel + merge, not a pipe.
//
// Both builders accept any resource, custom or global, `full` or `light`: a `light` one serializes
// redacted (no instructions, no tools; see `agent-json-redaction`). `enrichWithActions` takes custom
// agents only (see `actions-require-read`); the builders resolve global agents' tools themselves.

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
  const actionsByConfigurationModelId = await AgentResource.batchListActions(
    auth,
    resources
  );

  return new Map(
    [...actionsByConfigurationModelId].map(([id, actions]) => [id, { actions }])
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

  // Global agents share a sentinel configuration id, so their tools are resolved per resource
  // rather than keyed by id.
  const [favorites, tags, customActions, globalActions] = await Promise.all([
    enrichWithFavorites(auth, resources),
    enrichWithTags(auth, resources),
    enrichWithActions(
      auth,
      resources.filter((resource) => resource.scope !== "global")
    ),
    Promise.all(
      resources.map((resource) =>
        resource.scope === "global" ? resource.listActions(auth) : null
      )
    ),
  ]);

  return resources.map((resource, index) => {
    const base = bases[index];
    const isGlobal = resource.scope === "global";
    return {
      ...base,
      ...(favorites.get(base.sId) ?? { userFavorite: false }),
      ...(tags.get(base.id) ?? { tags: [] }),
      instructionsHtml: resource.isFull()
        ? resource.content.instructionsHtml
        : null,
      actions: isGlobal
        ? (globalActions[index] ?? [])
        : (customActions.get(base.id)?.actions ?? []),
      // A redacted agent exposes no skills (see `agent-json-redaction`).
      ...(!resource.isFull()
        ? { codeDefinedSkillIds: [] }
        : isGlobal
          ? { codeDefinedSkillIds: resource.codeDefinedSkillIds }
          : {}),
    };
  });
}
