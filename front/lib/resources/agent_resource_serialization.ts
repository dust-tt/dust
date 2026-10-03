import type { MCPServerConfigurationType } from "@app/lib/actions/mcp";
import { getFavoriteStates } from "@app/lib/api/assistant/get_favorite_states";
import { getAgentsRecentAuthors } from "@app/lib/api/assistant/recent_authors";
import type { Authenticator } from "@app/lib/auth";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { SkillHydrationOptions } from "@app/lib/resources/skill/types";
import type { UserResource } from "@app/lib/resources/user_resource";
import { tagsSorter } from "@app/lib/utils";
import type {
  AgentActionsEnrichment,
  AgentConfigurationType,
  AgentConfigurationWithSkillsType,
  AgentFavoriteEnrichment,
  AgentInstructionsEnrichment,
  AgentLastAuthorsEnrichment,
  AgentTagsEnrichment,
  LightAgentConfigurationType,
} from "@app/types/assistant/agent";
import type { AgentParticipantType } from "@app/types/assistant/conversation";
import type { AgentSkillType } from "@app/types/assistant/skill_configuration";

// The `enrichWith*` steps below each run the one query a configuration field needs, batched over
// statically-loaded `AgentResource`s. They have no dependency on one another, so
// `toLightAgentConfigurations`/`toAgentConfigurations` fan them out in parallel and shape and redact
// the JSON on top of `AgentResource.toJSON` (see `agent-json-redaction`). Both builders accept any
// resource, custom or global, whether or not the caller can view its content.

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
): Promise<Map<string, AgentLastAuthorsEnrichment>> {
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
 * @cc [owner:tdraier,label:backend] enrich-instructions-key-per-version
 * `enrichWithInstructions` keys its result by the input resource, which is one configuration
 * version: the instructions belong to that version. A resource whose content the caller cannot view
 * gets `null` instructions.
 */
export async function enrichWithInstructions(
  resources: AgentResource[]
): Promise<Map<AgentResource, AgentInstructionsEnrichment>> {
  const instructionsByAgent =
    await AgentResource.batchFetchInstructions(resources);

  return new Map(
    [...instructionsByAgent].map(([resource, instructions]) => [
      resource,
      instructions ?? { instructions: null, instructionsHtml: null },
    ])
  );
}

// Only `sId` and `name` reach the wire, so skip the instructions, tools and file attachments: see
// the `labels-only-skips-dynamic-instructions` contract.
const SKILL_LABELS_ONLY_FETCH_OPTIONS: SkillHydrationOptions = {
  withInstructions: false,
  withTools: false,
  withFileAttachments: false,
};

/**
 * @cc [owner:fabiencelier,label:security] no-skills-for-redacted-agents
 * `enrichWithSkills` keys its result by the input resource (one configuration version). A resource
 * the caller cannot `read` MUST get an empty `skills` array: its skills are private, consistently
 * with the redacted serialization (`agent-json-redaction`).
 */
export async function enrichWithSkills(
  auth: Authenticator,
  resources: AgentResource[]
): Promise<Map<AgentResource, { skills: AgentSkillType[] }>> {
  const skillsByAgent = await SkillResource.listByAgents(
    auth,
    resources.filter((resource) => auth.can("read", resource)),
    SKILL_LABELS_ONLY_FETCH_OPTIONS
  );

  return new Map(
    resources.map((resource) => [
      resource,
      {
        skills: (skillsByAgent.get(resource) ?? []).map((skill) =>
          skill.toAgentSkillJSON()
        ),
      },
    ])
  );
}

/**
 * @cc [owner:tdraier,label:security;backend] agent-json-redaction
 * `AgentResource.toJSON` owns the base shape (see `resource-owned-serialization`);
 * `toLightAgentConfigurations` and `toAgentConfigurations` are the only builders of an agent's
 * configuration JSON on top of it: they add the fields that need a query and MUST NOT reshape the
 * base fields. A resource whose content the caller cannot view (`!canViewContent`) MUST serialize
 * with `instructions: null` and, in the full shape, with `instructionsHtml: null`, no `actions` and
 * no `codeDefinedSkillIds`, whatever enrichment it is handed: the head fields and the version
 * metadata are not private and are always carried.
 */
function toLightConfigurationJSON(
  resource: AgentResource,
  {
    instructions,
    userFavorite,
    tags,
  }: Pick<AgentInstructionsEnrichment, "instructions"> &
    AgentFavoriteEnrichment &
    AgentTagsEnrichment
): LightAgentConfigurationType {
  return {
    ...resource.toJSON(),
    instructions: resource.canViewContent ? instructions : null,
    userFavorite,
    tags,
  };
}

function toConfigurationJSON(
  resource: AgentResource,
  {
    instructions,
    instructionsHtml,
    userFavorite,
    tags,
    actions,
  }: AgentInstructionsEnrichment &
    AgentFavoriteEnrichment &
    AgentTagsEnrichment &
    AgentActionsEnrichment
): AgentConfigurationType {
  const light = toLightConfigurationJSON(resource, {
    instructions,
    userFavorite,
    tags,
  });
  if (!resource.canViewContent) {
    return {
      ...light,
      instructionsHtml: null,
      actions: [],
      codeDefinedSkillIds: [],
    };
  }

  return {
    ...light,
    instructionsHtml,
    actions,
    ...(resource.scope === "global"
      ? { codeDefinedSkillIds: resource.codeDefinedSkillIds }
      : {}),
  };
}

export type LightAgentConfigurationOptions = {
  withInstructions?: boolean;
  withFavorites?: boolean;
  withTags?: boolean;
};

/**
 * Renders `LightAgentConfigurationType`s: the queried `instructions`, `userFavorite` and `tags` on
 * top of `AgentResource.toJSON`. Callers that never surface instructions, favorites or tags (e.g.
 * rendered messages) can skip their queries, and get `instructions: null`, `userFavorite: false`
 * and `tags: []`.
 */
export async function toLightAgentConfigurations(
  auth: Authenticator,
  resources: AgentResource[],
  {
    withInstructions = true,
    withFavorites = true,
    withTags = true,
  }: LightAgentConfigurationOptions = {}
): Promise<LightAgentConfigurationType[]> {
  const [instructions, favorites, tags] = await Promise.all([
    withInstructions
      ? enrichWithInstructions(resources)
      : new Map<AgentResource, AgentInstructionsEnrichment>(),
    withFavorites
      ? enrichWithFavorites(auth, resources)
      : new Map<string, AgentFavoriteEnrichment>(),
    withTags
      ? enrichWithTags(auth, resources)
      : new Map<AgentResource, AgentTagsEnrichment>(),
  ]);

  return resources.map((resource) =>
    toLightConfigurationJSON(resource, {
      ...(instructions.get(resource) ?? { instructions: null }),
      ...(favorites.get(resource.sId) ?? { userFavorite: false }),
      ...(tags.get(resource) ?? { tags: [] }),
    })
  );
}

// The light configuration of a single resource, as `toLightAgentConfigurations` renders it.
export async function toLightAgentConfiguration(
  auth: Authenticator,
  resource: AgentResource,
  options: LightAgentConfigurationOptions = {}
): Promise<LightAgentConfigurationType> {
  const [configuration] = await toLightAgentConfigurations(
    auth,
    [resource],
    options
  );
  return configuration;
}

/**
 * Renders full `AgentConfigurationType`s: the light enrichments plus the batched `instructionsHtml`
 * and `actions` (redacted when the caller cannot view the content). Instructions, favorites and
 * tags can be skipped as in `toLightAgentConfigurations` (`instructionsHtml` goes with
 * `instructions`).
 */
export async function toAgentConfigurations(
  auth: Authenticator,
  resources: AgentResource[],
  {
    withInstructions = true,
    withFavorites = true,
    withTags = true,
  }: LightAgentConfigurationOptions = {}
): Promise<AgentConfigurationType[]> {
  const [instructions, favorites, tags, actions] = await Promise.all([
    withInstructions
      ? enrichWithInstructions(resources)
      : new Map<AgentResource, AgentInstructionsEnrichment>(),
    withFavorites
      ? enrichWithFavorites(auth, resources)
      : new Map<string, AgentFavoriteEnrichment>(),
    withTags
      ? enrichWithTags(auth, resources)
      : new Map<AgentResource, AgentTagsEnrichment>(),
    enrichWithActions(auth, resources),
  ]);

  return resources.map((resource) =>
    toConfigurationJSON(resource, {
      ...(instructions.get(resource) ?? {
        instructions: null,
        instructionsHtml: null,
      }),
      ...(favorites.get(resource.sId) ?? { userFavorite: false }),
      ...(tags.get(resource) ?? { tags: [] }),
      ...(actions.get(resource) ?? { actions: [] }),
    })
  );
}

// The public API's agent shape: the light or full configuration plus the agent's `skills`, which
// replace the raw `codeDefinedSkillIds` of global agents on the wire.
export async function toAgentConfigurationsWithSkills(
  auth: Authenticator,
  resources: AgentResource[],
  { variant = "light" }: { variant?: "light" | "full" } = {}
): Promise<AgentConfigurationWithSkillsType[]> {
  const [configurations, skills] = await Promise.all([
    variant === "full"
      ? toAgentConfigurations(auth, resources)
      : toLightAgentConfigurations(auth, resources),
    enrichWithSkills(auth, resources),
  ]);

  return resources.map((resource, index) => {
    const {
      codeDefinedSkillIds: _codeDefinedSkillIds,
      ...configuration
    }: LightAgentConfigurationType & { codeDefinedSkillIds?: string[] } =
      configurations[index];
    return { ...configuration, ...(skills.get(resource) ?? { skills: [] }) };
  });
}

export function toParticipantJSON(
  resource: AgentResource
): AgentParticipantType {
  return {
    configurationId: resource.sId,
    name: resource.name,
    pictureUrl: resource.pictureUrl,
  };
}

export type PokeAgentSummaryJSON = {
  agentId: string;
  name: string;
  description: string;
  scope: AgentConfigurationType["scope"];
  status: AgentConfigurationType["status"];
  version: number;
  versionCreatedAt: string | null;
  instructionsLength: number;
  requestedSpaceCount: number;
};

export function toPokeAgentSummaryJSON(
  resource: AgentResource,
  { instructionsLength }: { instructionsLength: number }
): PokeAgentSummaryJSON {
  const json = resource.toJSON();
  return {
    agentId: json.sId,
    name: json.name,
    description: json.description,
    scope: json.scope,
    status: json.status,
    version: json.version,
    versionCreatedAt: json.versionCreatedAt,
    instructionsLength,
    requestedSpaceCount: json.requestedSpaceIds.length,
  };
}

type PokeAgentUserJSON = { userId: string; email: string; fullName: string };

function toPokeAgentUserJSON(user: UserResource): PokeAgentUserJSON {
  return { userId: user.sId, email: user.email, fullName: user.fullName() };
}

export type PokeAgentDetailsJSON = Omit<
  PokeAgentSummaryJSON,
  "requestedSpaceCount"
> & {
  instructions: string | null;
  toolCount: number;
  toolNames: string[];
  requestedSpaceIds: string[];
  author: PokeAgentUserJSON | null;
  editors: PokeAgentUserJSON[];
};

export function toPokeAgentDetailsJSON(
  resource: AgentResource,
  {
    instructions,
    actions,
    author,
    editors,
  }: {
    instructions: string | null;
    actions: MCPServerConfigurationType[];
    author: UserResource | null;
    editors: UserResource[];
  }
): PokeAgentDetailsJSON {
  const { requestedSpaceCount: _requestedSpaceCount, ...summary } =
    toPokeAgentSummaryJSON(resource, {
      instructionsLength: instructions?.length ?? 0,
    });
  return {
    ...summary,
    instructions,
    toolCount: actions.length,
    toolNames: actions.map((action) => action.name),
    requestedSpaceIds: resource.toJSON().requestedSpaceIds,
    author: author ? toPokeAgentUserJSON(author) : null,
    editors: editors.map(toPokeAgentUserJSON),
  };
}
