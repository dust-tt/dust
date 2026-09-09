import { DEFAULT_MCP_ACTION_DESCRIPTION } from "@app/lib/actions/constants";
import type { MCPServerConfigurationType } from "@app/lib/actions/mcp";
import type { UnsavedServerSideMCPServerConfigurationType } from "@app/lib/actions/types/agent";
import { isServerSideMCPServerConfiguration } from "@app/lib/actions/types/guards";
import type {
  SortStrategy,
  SortStrategyType,
} from "@app/lib/api/assistant/configuration/types";
import { globalAgentReaderRoles } from "@app/lib/api/assistant/global_agents/global_agent_metadata";
import { getGlobalAgents } from "@app/lib/api/assistant/global_agents/global_agents";
import { getAgentConfigurationRequirementsFromCapabilities } from "@app/lib/api/assistant/permissions";
import { agentConfigurationWasUpdatedBy } from "@app/lib/api/assistant/recent_authors";
import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { getPublicUploadBucket } from "@app/lib/file_storage";
import { getSupportedModelConfig } from "@app/lib/llms/model_configurations";
import { getModelTierAccessErrorForAgentConfiguration } from "@app/lib/model_tiers/access";
import { getModelsForAuth } from "@app/lib/model_tiers/enabled_models";
import {
  AgentConfigurationModel,
  AgentModel,
  AgentUserRelationModel,
} from "@app/lib/models/agent/agent";
import { AgentSkillModel } from "@app/lib/models/agent/agent_skill";
import { AgentSuggestionModel } from "@app/lib/models/agent/agent_suggestion";
import { MentionModel } from "@app/lib/models/agent/conversation";
import { GroupAgentModel } from "@app/lib/models/agent/group_agent";
import { TagAgentModel } from "@app/lib/models/agent/tag_agent";
import { AgentActionConfigurationResource } from "@app/lib/resources/agent/agent_action_configuration_resource";
import { AgentSearchIndexationResource } from "@app/lib/resources/agent/agent_search_indexation_resource";
import { GlobalAgentSettingsResource } from "@app/lib/resources/agent/global_agent_settings_resource";
import { AgentMemoryResource } from "@app/lib/resources/agent_memory_resource";
import { AgentUserRelationResource } from "@app/lib/resources/agent_user_relation_resource";
import { AppResource } from "@app/lib/resources/app_resource";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { canReadRequestedSpaces } from "@app/lib/resources/permission_utils";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { getResourceIdFromSId } from "@app/lib/resources/string_ids";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { TagResource } from "@app/lib/resources/tags_resource";
import { TemplateResource } from "@app/lib/resources/template_resource";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { WakeUpResource } from "@app/lib/resources/wakeup_resource";
import { ServerSideTracking } from "@app/lib/tracking/server";
import { tagsSorter } from "@app/lib/utils";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import {
  runAfterTransactionCommit,
  withTransaction,
  withTransactionResult,
} from "@app/lib/utils/sql_utils";
import logger from "@app/logger/logger";
import { tracer } from "@app/logger/tracer";
import type { PostOrPatchAgentConfigurationRequestBody } from "@app/types/api/agent_configuration";
import type {
  AgentConfigurationScope,
  AgentConfigurationType,
  AgentFetchVariant,
  AgentModelConfigurationType,
  AgentReinforcementMode,
  AgentStatus,
  AgentsGetViewType,
  GlobalAgentContext,
  LightAgentConfigurationType,
} from "@app/types/assistant/agent";
import {
  LightAgentConfigurationSchema,
  MAX_STEPS_USE_PER_RUN_LIMIT,
} from "@app/types/assistant/agent";
import {
  compareAgentsForSort,
  GLOBAL_AGENTS_SID,
  isGlobalAgentId,
} from "@app/types/assistant/assistant";
import { validateResponseFormat } from "@app/types/assistant/models/utils";
import type { GrantVerb } from "@app/types/group_permissions";
import type {
  AccessControlList,
  RoleGrant,
  WithAccessControl,
} from "@app/types/resource_permissions";
import type { SearchFilters } from "@app/types/search";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { normalizeAsInternalDustError } from "@app/types/shared/utils/error_utils";
import { removeNulls } from "@app/types/shared/utils/general";
import type { TagType } from "@app/types/tag";
import type { UserType, WorkspaceType } from "@app/types/user";
import { isAdmin } from "@app/types/user";
import assert from "assert";
import uniq from "lodash/uniq";
import type { Transaction, WhereOptions } from "sequelize";
import {
  Op,
  QueryTypes,
  Sequelize,
  UniqueConstraintError,
  ValidationError,
} from "sequelize";

// Legacy `canEdit` also allows changing the editor set, so the author fallback mirrors the full
// editor role rather than granting write alone.
const AGENT_EDITOR_VERBS: GrantVerb[] = ["read", "write", "admin"];

// Workspace admins manage editors but must grant themselves editor access to change the agent.
const HIDDEN_AGENT_ROLE_GRANTS: RoleGrant[] = [
  { role: "admin", permissions: ["read", "admin"] },
];

const VISIBLE_AGENT_ROLE_GRANTS: RoleGrant[] = [
  ...HIDDEN_AGENT_ROLE_GRANTS,
  { role: "manager", permissions: ["read"] },
  { role: "builder", permissions: ["read"] },
  { role: "user", permissions: ["read"] },
  { role: "none", permissions: ["read"] },
];

// Placeholder constants for pending agents
const PENDING_AGENT_PLACEHOLDER_NAME = "__PENDING__";

const PENDING_AGENT_PLACEHOLDER_DESCRIPTION = "";

const PENDING_AGENT_PLACEHOLDER_PICTURE_URL =
  "https://dust.tt/static/systemavatar/dust_avatar_full.png";

type AgentLabel = {
  sId: string;
  authorModelId: ModelId;
  name: string;
  pictureUrl: string | null;
  model: AgentModelConfigurationType;
  scope: Exclude<AgentConfigurationScope, "global">;
};

type ArchiveAgentConfigurationOptions = {
  dangerouslySkipPermissionFiltering?: boolean;
};

type AgentConfigurationsForViewBaseArgs = {
  auth: Authenticator;
  agentsGetView: AgentsGetViewType;
  agentPrefix?: string;
  limit?: number;
  sort?: SortStrategyType;
  dangerouslySkipPermissionFiltering?: boolean;
};

export type FullAgentConfigurationsForViewArgs =
  AgentConfigurationsForViewBaseArgs & {
    variant: "full";
    omitHeavyAttributes?: never;
  };

export type LightAgentConfigurationsForViewArgs =
  AgentConfigurationsForViewBaseArgs & {
    variant: Exclude<AgentFetchVariant, "full">;
    omitHeavyAttributes?: boolean;
  };

const HEAVY_AGENT_CONFIGURATION_ATTRIBUTES = [
  "instructions",
  "instructionsHtml",
] as const;

const sortStrategies: Record<SortStrategyType, SortStrategy> = {
  alphabetical: {
    dbOrder: [["name", "ASC"]],
    compareFunction: (a: AgentConfigurationType, b: AgentConfigurationType) =>
      a.name.localeCompare(b.name),
  },
  priority: {
    dbOrder: [["name", "ASC"]],
    compareFunction: compareAgentsForSort,
  },
  updatedAt: {
    dbOrder: [["updatedAt", "DESC"]],
    compareFunction: () => 0,
  },
};

export class AgentResource implements WithAccessControl {
  /**
   * @cc [owner:aubin-tchoi,label:backend;security] code-defined-agent-search-metadata
   * Search includes only active globals admitted by the canonical catalog, never creates
   * tool views, and returns the light schema with no instructions or capabilities.
   */
  static async listGlobalAgentsForSearch(
    auth: Authenticator,
    filters: SearchFilters = {}
  ): Promise<LightAgentConfigurationType[]> {
    if (
      filters.spaceIds?.length ||
      filters.editedByMe ||
      filters.isDefault !== undefined ||
      (filters.availability?.length &&
        !filters.availability.includes("workspace_users"))
    ) {
      return [];
    }
    const toolIds = new Set(filters.toolIds ?? []);
    const skillIds = new Set(filters.skillIds ?? []);
    const tagIds = new Set(filters.tagIds ?? []);
    // Dynamic tool attachments depend on current company knowledge. Hydrate capabilities only
    // when selecting by tools/skills; ordinary name/usage search keeps the light catalog path.
    const agents = await getGlobalAgents(
      auth,
      undefined,
      toolIds.size > 0 || skillIds.size > 0 ? "full" : "light",
      { ensureAutoViews: false }
    );
    return agents
      .filter(
        (agent) =>
          agent.status === "active" &&
          agent.canRead &&
          (tagIds.size === 0 ||
            agent.tags.some((tag) => tagIds.has(tag.sId))) &&
          (toolIds.size === 0 ||
            agent.actions.some(
              (action) =>
                isServerSideMCPServerConfiguration(action) &&
                toolIds.has(action.mcpServerViewId)
            )) &&
          (skillIds.size === 0 ||
            agent.skills?.some((skillId) => skillIds.has(skillId)))
      )
      .map((agent) =>
        LightAgentConfigurationSchema.parse({
          ...agent,
          instructions: null,
          userFavorite: false,
        })
      );
  }

  static toModelJSON(
    agent: Omit<AgentModelConfigurationType, "reasoningEffort"> & {
      reasoningEffort?: AgentModelConfigurationType["reasoningEffort"] | null;
    }
  ): AgentModelConfigurationType {
    const model: AgentModelConfigurationType = {
      providerId: agent.providerId,
      modelId: agent.modelId,
      temperature: agent.temperature,
    };

    if (agent.responseFormat) {
      model.responseFormat = agent.responseFormat;
    }

    // Always set reasoning effort, using model default if null/undefined
    if (agent.reasoningEffort) {
      model.reasoningEffort = agent.reasoningEffort;
    } else {
      // Get the model configuration to use default reasoning effort
      const modelConfig = getSupportedModelConfig({
        providerId: agent.providerId,
        modelId: agent.modelId,
      });
      if (modelConfig) {
        model.reasoningEffort = modelConfig.defaultReasoningEffort;
      }
    }

    return model;
  }

  private static async isSelfHostedImageWithValidContentType(
    pictureUrl: string
  ) {
    // Accept static Dust avatars.
    if (pictureUrl.startsWith("https://dust.tt/static/")) {
      return true;
    }

    const filename = pictureUrl.split("/").at(-1);
    if (!filename) {
      return false;
    }

    // Attempt to decode the URL, since Google Cloud Storage URL encodes the filename.
    const contentTypeResult = await getPublicUploadBucket().getFileContentType(
      decodeURIComponent(filename)
    );
    if (contentTypeResult.isErr() || !contentTypeResult.value) {
      return false;
    }

    return contentTypeResult.value.includes("image");
  }

  static async getAgentIdFromName(
    auth: Authenticator,
    name: string
  ): Promise<string | null> {
    const owner = auth.getNonNullableWorkspace();

    const agent = await AgentConfigurationModel.findOne({
      attributes: ["sId"],
      where: {
        workspaceId: owner.id,
        name,
        status: "active",
      },
    });

    if (!agent) {
      return null;
    }

    return agent.sId;
  }

  /**
   * @cc [owner:aubin-tchoi,label:backend;security;performance] versioned-agent-serialization
   * Configuration serialization preserves legacy author/editor visibility and fetch-variant
   * fields, with batched relationship reads; stable-resource ACLs do not replace these checks.
   */
  private static async toConfigurationsJSON<V extends AgentFetchVariant>(
    auth: Authenticator,
    agentConfigurations: AgentConfigurationModel[],
    {
      variant,
      agentIdsForUserAsEditor,
    }: {
      variant: V;
      agentIdsForUserAsEditor?: ModelId[];
    }
  ): Promise<AgentConfigurationType[]> {
    if (agentConfigurations.length === 0) {
      return [];
    }
    const configurationIds = agentConfigurations.map((a) => a.id);
    const configurationSIds = agentConfigurations.map((a) => a.sId);
    const user = auth.user();

    // Compute editor permissions if not provided
    let editorIds = agentIdsForUserAsEditor;
    if (!editorIds) {
      const agentIdsForGroups = user
        ? await GroupResource.findAgentIdsForGroups(auth, auth.groupModelIds())
        : [];

      editorIds = agentIdsForGroups.map((g) => g.agentConfigurationId);
    }

    const [
      mcpServerActionsConfigurationsPerAgent,
      favoriteStatePerAgent,
      tagsPerAgent,
    ] = await Promise.all([
      AgentActionConfigurationResource.fetchConfigurations(auth, {
        configurationIds,
        variant,
      }),
      user && variant !== "extra_light"
        ? AgentUserRelationResource.getFavoriteStates(auth, {
            configurationIds: configurationSIds,
          })
        : Promise.resolve(new Map<string, boolean>()),
      variant !== "extra_light"
        ? TagResource.listForAgents(auth, configurationIds)
        : Promise.resolve([]),
    ]);

    const editorIdSet = new Set(editorIds);
    const agentConfigurationTypes: AgentConfigurationType[] = [];
    for (const agent of agentConfigurations) {
      const actions =
        variant === "full"
          ? (mcpServerActionsConfigurationsPerAgent.get(agent.id) ?? [])
          : [];

      const model = AgentResource.toModelJSON(agent);
      const tags: TagResource[] = tagsPerAgent[agent.id] ?? [];

      const isAuthor = agent.authorId === auth.user()?.id;
      const isMember = editorIdSet.has(agent.id);

      const agentConfigurationType: AgentConfigurationType = {
        id: agent.id,
        sId: agent.sId,
        versionCreatedAt: agent.createdAt.toISOString(),
        version: agent.version,
        scope: agent.scope,
        userFavorite: !!favoriteStatePerAgent.get(agent.sId),
        name: agent.name,
        pictureUrl: agent.pictureUrl,
        description: agent.description,
        instructions: agent.instructions,
        instructionsHtml: variant === "full" ? agent.instructionsHtml : null,
        model,
        status: agent.status,
        actions,
        versionAuthorId: agent.authorId,
        maxStepsPerRun: agent.maxStepsPerRun,
        templateId: agent.templateId
          ? TemplateResource.modelIdToSId({ id: agent.templateId })
          : null,
        // TODO(2025-10-20 flav): Remove once SDK JS does not rely on it anymore.
        visualizationEnabled: false,
        requestedGroupIds: [],
        requestedSpaceIds: agent.requestedSpaceIds.map((spaceId) =>
          SpaceResource.modelIdToSId({
            id: spaceId,
            workspaceId: auth.getNonNullableWorkspace().id,
          })
        ),
        tags: tags.map((t) => t.toJSON()).sort(tagsSorter),
        reinforcement: agent.reinforcement,
        lastReinforcementAnalysisAt:
          agent.lastReinforcementAnalysisAt?.toISOString() ?? null,
        canRead: isAuthor || isMember || agent.scope === "visible",
        canEdit: isAuthor || isMember,
      };

      agentConfigurationTypes.push(agentConfigurationType);
    }

    return agentConfigurationTypes;
  }

  /**
   * Admins can list every agent of the workspace but the prompt, skills and knowledge of the agents
   * they cannot read (unpublished, or built on spaces they are not a member of) stay private. Tools
   * live in `actions` alongside knowledge, so all actions are dropped for now. `canRead` is set to
   * false so clients can tell the details were redacted. A light fetch is enough as input: the
   * fields that only the full variant carries are the redacted ones.
   */
  private static redactPrivateAgentConfigurationFields(
    agent: LightAgentConfigurationType
  ): AgentConfigurationType {
    return {
      ...agent,
      instructions: null,
      instructionsHtml: null,
      actions: [],
      skills: [],
      canRead: false,
    };
  }

  private static makeApplySortAndLimit(
    sort?: SortStrategyType,
    limit?: number
  ) {
    return (results: AgentConfigurationType[]) => {
      const sortStrategy = sort && sortStrategies[sort];

      const sortedResults = sortStrategy
        ? results.toSorted(sortStrategy.compareFunction)
        : results;

      return limit ? sortedResults.slice(0, limit) : sortedResults;
    };
  }

  private static determineGlobalAgentIdsToFetch(
    agentsGetView: AgentsGetViewType
  ): string[] | undefined {
    switch (agentsGetView) {
      case "archived":
      case "published":
      case "current_user":
        return []; // fetch no global agents
      case "global":
      case "list":
      case "manage":
      case "manage_unrestricted":
      case "all":
      case "analytics":
      case "favorites":
      case "admin_internal":
        return undefined; // undefined means all global agents will be fetched
      default:
        assertNever(agentsGetView);
    }
  }

  private static async fetchGlobalAgentConfigurationForView(
    auth: Authenticator,
    {
      agentPrefix,
      agentsGetView,
      variant,
      omitHeavyAttributes,
    }: {
      agentPrefix?: string;
      agentsGetView: AgentsGetViewType;
      variant: AgentFetchVariant;
      omitHeavyAttributes?: boolean;
    }
  ) {
    const globalAgentIdsToFetch =
      AgentResource.determineGlobalAgentIdsToFetch(agentsGetView);
    const allGlobalAgents = await getGlobalAgents(
      auth,
      globalAgentIdsToFetch,
      variant
    );
    // Global agents have `instructions` baked in; strip when not needed.
    const normalizedGlobalAgents = omitHeavyAttributes
      ? allGlobalAgents.map((a) => ({ ...a, instructions: null }))
      : allGlobalAgents;
    const matchingGlobalAgents = normalizedGlobalAgents.filter(
      (a) =>
        !agentPrefix ||
        a.name.toLowerCase().startsWith(agentPrefix.toLowerCase())
    );

    if (
      agentsGetView === "global" ||
      agentsGetView === "manage" ||
      agentsGetView === "manage_unrestricted"
    ) {
      // All global agents in global and manage views.
      return matchingGlobalAgents;
    }

    if (agentsGetView === "favorites") {
      const favoriteStates = await AgentUserRelationResource.getFavoriteStates(
        auth,
        {
          configurationIds: matchingGlobalAgents.map((a) => a.sId),
        }
      );
      return matchingGlobalAgents.filter(
        (a) => favoriteStates.get(a.sId) && a.status === "active"
      );
    }

    // If not in global or agent view, filter out global agents that are not active.
    return matchingGlobalAgents.filter((a) => a.status === "active");
  }

  private static async fetchWorkspaceAgentConfigurationsWithoutActions(
    auth: Authenticator,
    {
      agentPrefix,
      agentsGetView,
      agentIdsForUserAsEditor,
      limit,
      owner,
      sort,
      omitHeavyAttributes,
    }: {
      agentPrefix?: string;
      agentsGetView: Exclude<AgentsGetViewType, "global">;
      agentIdsForUserAsEditor: ModelId[];
      limit?: number;
      owner: WorkspaceType;
      sort?: SortStrategyType;
      omitHeavyAttributes?: boolean;
    }
  ): Promise<AgentConfigurationModel[]> {
    const sortStrategy = sort && sortStrategies[sort];

    const baseWhereConditions = {
      workspaceId: owner.id,
      status: "active",
      ...(agentPrefix ? { name: { [Op.iLike]: `${agentPrefix}%` } } : {}),
    };

    const attributesToExclude = omitHeavyAttributes
      ? HEAVY_AGENT_CONFIGURATION_ATTRIBUTES
      : [];
    const excludeAttributesFromSelect =
      attributesToExclude.length > 0
        ? { attributes: { exclude: [...new Set(attributesToExclude)] } }
        : {};

    const baseAgentsSequelizeQuery = {
      limit,
      order: sortStrategy?.dbOrder,
      ...excludeAttributesFromSelect,
    };

    const baseConditionsAndScopesIn = (scopes: string[]) => ({
      ...baseWhereConditions,
      scope: { [Op.in]: scopes },
    });

    switch (agentsGetView) {
      case "admin_internal":
      // The manage agents page lets admins list every agent of the workspace, including the ones
      // they neither edit nor can read the spaces of. Space filtering is skipped below.
      case "manage_unrestricted":
        return AgentConfigurationModel.findAll({
          ...baseAgentsSequelizeQuery,
          where: baseWhereConditions,
        });

      // Analytics reports on every agent, so managers and admins get the private
      // ones too. Everyone else sees what `all` returns.
      case "analytics":
        return AgentConfigurationModel.findAll({
          ...baseAgentsSequelizeQuery,
          where: auth.isManager()
            ? baseWhereConditions
            : baseConditionsAndScopesIn(["workspace", "published", "visible"]),
        });

      case "current_user":
        const authorId = auth.getNonNullableUser().id;
        const r = await AgentConfigurationModel.findAll({
          attributes: ["sId"],
          group: "sId",
          where: {
            workspaceId: owner.id,
            authorId,
          },
        });

        return AgentConfigurationModel.findAll({
          ...baseAgentsSequelizeQuery,
          where: {
            ...baseWhereConditions,
            sId: { [Op.in]: [...new Set(r.map((r) => r.sId))] },
          },
        });
      case "archived":
        // Get the latest version of all archived agents.
        // For each sId, we want to fetch the one with the highest version, only if its status is "archived".
        return AgentConfigurationModel.findAll({
          attributes: [[Sequelize.fn("MAX", Sequelize.col("id")), "id"]],
          group: "sId",
          where: {
            workspaceId: owner.id,
          },
        }).then(async (result) => {
          const editorIds = new Set(agentIdsForUserAsEditor);
          const filteredIds = result
            .map((agent) => agent.id)
            .filter((id) => editorIds.has(id) || auth.isAdmin());

          return AgentConfigurationModel.findAll({
            ...excludeAttributesFromSelect,
            where: {
              workspaceId: owner.id,
              id: {
                [Op.in]: filteredIds,
              },
              status: "archived",
              ...(agentPrefix
                ? { name: { [Op.iLike]: `${agentPrefix}%` } }
                : {}),
            },
          });
        });

      case "all":
        return AgentConfigurationModel.findAll({
          ...baseAgentsSequelizeQuery,
          where: baseConditionsAndScopesIn([
            "workspace",
            "published",
            "visible",
          ]),
        });

      case "published":
        return AgentConfigurationModel.findAll({
          ...baseAgentsSequelizeQuery,
          where: baseConditionsAndScopesIn(["published", "visible"]),
        });

      case "list":
      case "manage":
        const user = auth.user();
        return AgentConfigurationModel.findAll({
          ...baseAgentsSequelizeQuery,
          where: {
            ...baseWhereConditions,
            [Op.or]: [
              { scope: { [Op.in]: ["workspace", "published", "visible"] } },
              ...(user
                ? [
                    { authorId: user.id, scope: "private" },
                    {
                      id: { [Op.in]: agentIdsForUserAsEditor },
                      scope: "hidden",
                    },
                  ]
                : []),
            ],
          },
        });
      case "favorites":
        const userId = auth.user()?.id;
        if (!userId) {
          return [];
        }
        const relations = await AgentUserRelationModel.findAll({
          where: {
            workspaceId: owner.id,
            userId,
            favorite: true,
          },
        });

        const sIds = relations.map((r) => r.agentConfiguration);
        if (sIds.length === 0) {
          return [];
        }

        return AgentConfigurationModel.findAll({
          ...baseAgentsSequelizeQuery,
          where: {
            ...baseWhereConditions,
            sId: { [Op.in]: sIds },
          },
        });
      default:
        assertNever(agentsGetView);
    }
  }

  private static async fetchWorkspaceAgentConfigurationsForView(
    auth: Authenticator,
    owner: WorkspaceType,
    {
      agentPrefix,
      agentsGetView,
      limit,
      sort,
      variant,
      dangerouslySkipPermissionFiltering,
      omitHeavyAttributes,
    }: {
      agentPrefix?: string;
      agentsGetView: Exclude<AgentsGetViewType, "global">;
      limit?: number;
      sort?: SortStrategyType;
      variant: AgentFetchVariant;
      dangerouslySkipPermissionFiltering?: boolean;
      omitHeavyAttributes?: boolean;
    }
  ) {
    const user = auth.user();

    const agentIdsForGroups = user
      ? await GroupResource.findAgentIdsForGroups(auth, auth.groupModelIds())
      : [];

    const agentIdsForUserAsEditor = agentIdsForGroups.map(
      (g) => g.agentConfigurationId
    );

    const agentModels =
      await AgentResource.fetchWorkspaceAgentConfigurationsWithoutActions(
        auth,
        {
          agentPrefix,
          agentsGetView,
          agentIdsForUserAsEditor,
          limit,
          owner,
          sort,
          omitHeavyAttributes,
        }
      );

    // Analytics counts credits for agents built on spaces a manager cannot read,
    // so the manager analytics view has to list them as well. The unrestricted manage view does the
    // same for admins, and is gated on the role by its caller.
    // Archived is unrestricted for admins too, matching its documented admin/superuser-only contract.
    const skipPermissionFiltering =
      dangerouslySkipPermissionFiltering ||
      (agentsGetView === "analytics" && auth.isManager()) ||
      agentsGetView === "manage_unrestricted" ||
      (agentsGetView === "archived" && auth.isAdmin());

    const allowedAgentModels = skipPermissionFiltering
      ? agentModels
      : await AgentResource.filterAgentsByRequestedSpaces(auth, agentModels);

    return AgentResource.toConfigurationsJSON(auth, allowedAgentModels, {
      variant,
      agentIdsForUserAsEditor,
    });
  }

  /**
   * @cc [owner:aubin-tchoi,label:backend;security] resource-owned-agent-views
   * Listings preserve each existing view's role gate, space filtering, globals, ordering and limit.
   */
  static getAgentConfigurationsForView(
    args: FullAgentConfigurationsForViewArgs
  ): Promise<AgentConfigurationType[]>;
  static getAgentConfigurationsForView(
    args: LightAgentConfigurationsForViewArgs
  ): Promise<LightAgentConfigurationType[]>;
  static async getAgentConfigurationsForView({
    auth,
    agentsGetView,
    agentPrefix,
    variant,
    limit,
    sort,
    dangerouslySkipPermissionFiltering,
    omitHeavyAttributes,
  }: FullAgentConfigurationsForViewArgs | LightAgentConfigurationsForViewArgs) {
    const owner = auth.workspace();
    if (!owner || !auth.isUser()) {
      throw new Error("Unexpected `auth` without `workspace`.");
    }
    const plan = auth.plan();
    if (!plan) {
      throw new Error("Unexpected `auth` without `plan`.");
    }

    const user = auth.user();

    if (
      agentsGetView === "admin_internal" &&
      !auth.isDustSuperUser() &&
      !auth.isAdmin()
    ) {
      throw new Error(
        "Superuser view is for dust superusers or internal admin auths only."
      );
    }

    if (agentsGetView === "manage_unrestricted" && !auth.isAdmin()) {
      throw new Error("The unrestricted manage view is for admins only.");
    }

    if (
      !user &&
      (agentsGetView === "list" ||
        agentsGetView === "manage" ||
        agentsGetView === "favorites")
    ) {
      throw new Error(`'${agentsGetView}' view is specific to a user.`);
    }

    const applySortAndLimit = AgentResource.makeApplySortAndLimit(sort, limit);

    if (agentsGetView === "global") {
      const allGlobalAgents =
        await AgentResource.fetchGlobalAgentConfigurationForView(auth, {
          agentPrefix,
          agentsGetView,
          variant,
          omitHeavyAttributes,
        });

      return applySortAndLimit(allGlobalAgents);
    }

    // Only workspace agents are filtered by requested spaces (unless dangerouslySkipPermissionFiltering is true)
    // Global agents are not linked to any space.
    const allAgentConfigurations = await Promise.all([
      AgentResource.fetchGlobalAgentConfigurationForView(auth, {
        agentPrefix,
        agentsGetView,
        variant,
        omitHeavyAttributes,
      }),
      AgentResource.fetchWorkspaceAgentConfigurationsForView(auth, owner, {
        agentPrefix,
        agentsGetView,
        limit,
        sort,
        variant,
        dangerouslySkipPermissionFiltering,
        omitHeavyAttributes,
      }),
    ]);

    return applySortAndLimit(allAgentConfigurations.flat());
  }

  /**
   * @cc [owner:aubin-tchoi,label:backend;concurrency] agent-search-after-commit
   * Resource mutations enqueue stable logical IDs only after their outer transaction commits.
   * Global agents are code-defined and must never create workspace-specific index documents.
   */
  static async launchSearchIndexation(
    auth: Authenticator,
    agentIds: readonly string[],
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<void> {
    await AgentSearchIndexationResource.launch(
      { workspaceId: auth.getNonNullableWorkspace().sId, agentIds },
      { transaction }
    );
  }

  private constructor(
    readonly id: ModelId | null,
    readonly sId: string,
    readonly workspaceId: ModelId,
    readonly kind: "custom" | "global",
    private readonly authorId: ModelId | null,
    private readonly scope: AgentConfigurationScope
  ) {}

  static async setUserFavorite({
    auth,
    agentId,
    userFavorite,
  }: {
    auth: Authenticator;
    agentId: string;
    userFavorite: boolean;
  }): Promise<Result<{ agentId: string; userFavorite: boolean }, Error>> {
    const agent = await AgentResource.getAgentConfiguration(auth, {
      agentId,
      variant: "light",
    });
    if (!agent) {
      return new Err(
        new Error(`Could not find agent configuration ${agentId}`)
      );
    }
    if (agent.status !== "active") {
      return new Err(new Error("Agent is not active"));
    }
    await AgentUserRelationResource.setFavorite(auth, {
      agentId,
      favorite: userFavorite,
    });
    return new Ok({ agentId, userFavorite });
  }

  static async transferAuthorship(
    auth: Authenticator,
    {
      primaryUser,
      secondaryUser,
    }: { primaryUser: UserResource; secondaryUser: UserResource },
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<void> {
    assert(primaryUser.id !== secondaryUser.id);
    const workspace = auth.getNonNullableWorkspace();
    const agentIds = await withTransaction(async (t) => {
      const agents = await AgentConfigurationModel.findAll({
        attributes: ["sId"],
        where: {
          workspaceId: workspace.id,
          authorId: [primaryUser.id, secondaryUser.id],
        },
        transaction: t,
      });
      await AgentConfigurationModel.update(
        { authorId: primaryUser.id },
        {
          where: { workspaceId: workspace.id, authorId: secondaryUser.id },
          transaction: t,
        }
      );
      return [...new Set(agents.map((agent) => agent.sId))];
    }, transaction);
    await this.launchSearchIndexation(auth, agentIds, { transaction });
  }

  static fromAgentConfigurationModel(
    configuration: Pick<
      AgentConfigurationModel,
      "agentId" | "authorId" | "sId" | "scope" | "workspaceId"
    >
  ): AgentResource {
    return new AgentResource(
      configuration.agentId,
      configuration.sId,
      configuration.workspaceId,
      "custom",
      configuration.authorId,
      configuration.scope
    );
  }

  static fromGlobalAgent({
    agentId,
    workspaceModelId,
  }: {
    agentId: GLOBAL_AGENTS_SID;
    workspaceModelId: ModelId;
  }): AgentResource {
    return new AgentResource(
      null,
      agentId,
      workspaceModelId,
      "global",
      null,
      "global"
    );
  }

  static async fetchByAgentConfiguration(
    auth: Authenticator,
    configuration: Pick<
      LightAgentConfigurationType,
      "sId" | "scope" | "versionAuthorId"
    >,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<AgentResource> {
    assert(configuration.scope !== "global");
    assert(
      configuration.versionAuthorId !== null,
      "Unexpected: custom agent author is missing"
    );

    // agents.sId is unique, so this resolves one stable ID regardless of version count.
    const agent = await AgentModel.findOne({
      where: {
        sId: configuration.sId,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      attributes: ["id", "workspaceId"],
      transaction,
    });
    assert(agent, "Unexpected: agent identity is missing");

    return this.fromAgentConfigurationModel({
      agentId: agent.id,
      authorId: configuration.versionAuthorId,
      sId: configuration.sId,
      scope: configuration.scope,
      workspaceId: agent.workspaceId,
    });
  }

  async grantEditors(
    auth: Authenticator,
    { editors, transaction }: { editors: UserType[]; transaction: Transaction }
  ): Promise<void> {
    assert(this.kind === "custom");
    assert(this.id !== null);
    assert(auth.getNonNullableWorkspace().id === this.workspaceId);

    const grantResult = await GroupPermissionResource.grantToUsers(auth, {
      users: editors,
      grantType: "editor",
      resourceType: "agent",
      resourceId: this.id,
      transaction,
    });
    if (grantResult.isErr()) {
      throw grantResult.error;
    }
  }

  async revokeEditors(
    auth: Authenticator,
    { editors, transaction }: { editors: UserType[]; transaction: Transaction }
  ): Promise<void> {
    assert(this.kind === "custom");
    assert(this.id !== null);
    assert(auth.getNonNullableWorkspace().id === this.workspaceId);

    const revokeResult = await GroupPermissionResource.revokeFromUsers(auth, {
      users: editors,
      grantType: "editor",
      resourceType: "agent",
      resourceId: this.id,
      transaction,
    });
    if (revokeResult.isErr()) {
      throw revokeResult.error;
    }
  }

  getAccessControlLists(auth: Authenticator): AccessControlList[] {
    switch (this.kind) {
      case "global":
        assert(isGlobalAgentId(this.sId));

        return [
          {
            roles: globalAgentReaderRoles(this.sId).map((role) => ({
              role,
              permissions: ["read"],
            })),
            workspaceId: this.workspaceId,
          },
        ];
      case "custom": {
        assert(this.id !== null);
        assert(this.authorId !== null);

        const grants = auth.getGrantedVerbs("agent", this.id);
        const isAuthor =
          auth.workspace()?.id === this.workspaceId &&
          auth.user()?.id === this.authorId;

        return [
          {
            roles:
              this.scope === "visible"
                ? VISIBLE_AGENT_ROLE_GRANTS
                : HIDDEN_AGENT_ROLE_GRANTS,
            grantedVerbs: isAuthor
              ? [...new Set([...grants, ...AGENT_EDITOR_VERBS])]
              : grants,
            workspaceId: this.workspaceId,
          },
        ];
      }
      default:
        return assertNever(this.kind);
    }
  }

  /**
   * Creates a pending agent configuration.
   * Pending agents are placeholders created when the agent builder is opened for a new agent,
   * before it is saved for the first time. This allows capturing the sId early.
   */
  static async createPendingAgentConfiguration(
    auth: Authenticator
  ): Promise<Result<{ sId: string }, Error>> {
    const canCreate = await auth.hasWorkspacePermission("create", "agent");
    if (!canCreate) {
      return new Err(new Error("Creating agents is restricted."));
    }

    const owner = auth.getNonNullableWorkspace();
    const user = auth.getNonNullableUser();

    const sId = generateRandomModelSId();
    const { defaultModel } = await getModelsForAuth(auth);

    await withTransaction(async (t) => {
      const agentIdentity = await AgentModel.create(
        {
          sId,
          workspaceId: owner.id,
        },
        { transaction: t }
      );
      const agent = await AgentConfigurationModel.create(
        {
          sId,
          agentId: agentIdentity.id,
          version: 0,
          status: "pending",
          scope: "hidden",
          name: PENDING_AGENT_PLACEHOLDER_NAME,
          description: PENDING_AGENT_PLACEHOLDER_DESCRIPTION,
          instructions: null,
          providerId: defaultModel.providerId,
          modelId: defaultModel.modelId,
          temperature: 0.7,
          reasoningEffort: defaultModel.defaultReasoningEffort,
          maxStepsPerRun: 8,
          reinforcement: "auto",
          pictureUrl: PENDING_AGENT_PLACEHOLDER_PICTURE_URL,
          workspaceId: owner.id,
          authorId: user.id,
          templateId: null,
          requestedSpaceIds: [],
        },
        { transaction: t }
      );

      await GroupResource.makeNewAgentEditorsGroup(auth, agent, {
        transaction: t,
        authorId: user.id,
      });
      await AgentResource.fromAgentConfigurationModel(agent).grantEditors(
        auth,
        {
          editors: [user.toJSON()],
          transaction: t,
        }
      );
    });
    await auth.refresh();

    return new Ok({ sId });
  }

  static async getAgentConfigurationsWithVersion<V extends AgentFetchVariant>(
    auth: Authenticator,
    agentIdsWithVersion: { agentId: string; agentVersion: number }[],
    {
      variant,
      dangerouslySkipPermissionFiltering,
    }: { variant: V; dangerouslySkipPermissionFiltering?: boolean }
  ): Promise<
    V extends "light" ? LightAgentConfigurationType[] : AgentConfigurationType[]
  > {
    const owner = auth.workspace();
    if (!owner || !auth.isUser()) {
      throw new Error("Unexpected `auth` without `workspace`.");
    }

    const globalAgentIds = agentIdsWithVersion
      .map(({ agentId }) => agentId)
      .filter(isGlobalAgentId);

    let globalAgents: AgentConfigurationType[] = [];
    if (globalAgentIds.length > 0) {
      globalAgents = await getGlobalAgents(auth, globalAgentIds, variant);
    }

    const workspaceAgentModels = await AgentConfigurationModel.findAll({
      where: {
        workspaceId: owner.id,
        [Op.or]: agentIdsWithVersion
          .filter(({ agentId }) => !isGlobalAgentId(agentId))
          .map(({ agentId: sId, agentVersion: version }) => ({
            sId,
            version,
          })),
      },
    });

    const allowedAgentModels = dangerouslySkipPermissionFiltering
      ? workspaceAgentModels
      : await AgentResource.filterAgentsByRequestedSpaces(
          auth,
          workspaceAgentModels
        );
    const workspaceAgents = await AgentResource.toConfigurationsJSON(
      auth,
      allowedAgentModels,
      {
        variant,
      }
    );

    const agents = [...globalAgents, ...workspaceAgents];

    return agents as V extends "light"
      ? LightAgentConfigurationType[]
      : AgentConfigurationType[];
  }

  /**
   * Get all versions of a single agent.
   */
  static async listsAgentConfigurationVersions<V extends AgentFetchVariant>(
    auth: Authenticator,
    { agentId, variant }: { agentId: string; variant: V }
  ): Promise<
    V extends "full" ? AgentConfigurationType[] : LightAgentConfigurationType[]
  > {
    const owner = auth.workspace();
    if (!owner || !auth.isUser()) {
      throw new Error("Unexpected `auth` without `workspace`.");
    }

    let agents: AgentConfigurationType[];
    if (isGlobalAgentId(agentId)) {
      agents = await getGlobalAgents(auth, [agentId], variant);
    } else {
      const agentModels = await AgentConfigurationModel.findAll({
        where: {
          workspaceId: owner.id,
          sId: agentId,
        },
        order: [["version", "DESC"]],
      });
      const allowedAgentModels =
        await AgentResource.filterAgentsByRequestedSpaces(auth, agentModels);
      agents = await AgentResource.toConfigurationsJSON(
        auth,
        allowedAgentModels,
        {
          variant,
        }
      );
    }

    return agents as V extends "full"
      ? AgentConfigurationType[]
      : LightAgentConfigurationType[];
  }

  private static async fetchLatestWorkspaceAgentModels(
    auth: Authenticator,
    workspaceAgentIds: string[]
  ): Promise<AgentConfigurationModel[]> {
    if (workspaceAgentIds.length === 0) {
      return [];
    }

    // Agent sIds are globally unique (every agent starts at version 0, and
    // (sId, version) is unique). Resolve the latest model id through that index
    // first, then enforce workspace isolation while loading the model row. This
    // avoids sorting every historical version of heavily edited agents.
    const query = `
    SELECT agent_configuration.*
    FROM (
      SELECT DISTINCT unnest($agentIds::text[]) AS "sId"
    ) requested_agent
    JOIN LATERAL (
      SELECT id
      FROM agent_configurations
      WHERE "sId" = requested_agent."sId"
      ORDER BY version DESC
      LIMIT 1
    ) latest_agent ON true
    JOIN agent_configurations AS agent_configuration
      ON agent_configuration.id = latest_agent.id
      AND agent_configuration."workspaceId" = $workspaceId
    ORDER BY agent_configuration.version DESC
  `;

    return (
      (await AgentConfigurationModel.sequelize?.query(query, {
        type: QueryTypes.SELECT,
        bind: {
          workspaceId: auth.getNonNullableWorkspace().id,
          agentIds: workspaceAgentIds,
        },
        model: AgentConfigurationModel,
        mapToModel: true,
      })) ?? []
    );
  }

  /**
   * When each agent first appeared. Not the active row's `createdAt`: upgrading inserts a new row, so
   * that date is really the last edit.
   */
  static async fetchFirstVersionCreatedAtByAgentId(
    auth: Authenticator,
    agentIds: string[]
  ): Promise<Map<string, Date>> {
    if (agentIds.length === 0) {
      return new Map();
    }

    const firstVersions = await AgentConfigurationModel.findAll({
      attributes: ["sId", "createdAt"],
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        sId: { [Op.in]: agentIds },
        version: 0,
      },
    });

    return new Map(firstVersions.map(({ sId, createdAt }) => [sId, createdAt]));
  }

  /**
   * Get the latest versions of multiple agents.
   */
  static async getAgentConfigurations<V extends AgentFetchVariant>(
    auth: Authenticator,
    {
      agentIds,
      variant,
      globalAgentContext,
      dangerouslySkipPermissionFiltering,
    }: {
      agentIds: string[];
      variant: V;
      globalAgentContext?: GlobalAgentContext;
      dangerouslySkipPermissionFiltering?: boolean;
    }
  ): Promise<
    V extends "full" ? AgentConfigurationType[] : LightAgentConfigurationType[]
  > {
    return tracer.trace("getAgentConfigurations", async () => {
      const owner = auth.workspace();
      if (!owner) {
        throw new Error("Unexpected `auth` without `workspace`.");
      }
      if (!auth.isUser()) {
        throw new Error("Unexpected `auth` without `user` permissions.");
      }

      const globalAgentIds = agentIds.filter(isGlobalAgentId);

      let globalAgents: AgentConfigurationType[] = [];
      if (globalAgentIds.length > 0) {
        globalAgents = await getGlobalAgents(auth, globalAgentIds, variant, {
          globalAgentContext,
        });
      }

      const workspaceAgentIds = agentIds.filter((id) => !isGlobalAgentId(id));

      let workspaceAgents: AgentConfigurationType[] = [];
      if (workspaceAgentIds.length > 0) {
        const agentModels = await AgentResource.fetchLatestWorkspaceAgentModels(
          auth,
          workspaceAgentIds
        );

        const allowedAgentModels = dangerouslySkipPermissionFiltering
          ? agentModels
          : await AgentResource.filterAgentsByRequestedSpaces(
              auth,
              agentModels
            );
        workspaceAgents = await AgentResource.toConfigurationsJSON(
          auth,
          allowedAgentModels,
          {
            variant,
          }
        );
      }

      const agents = [...globalAgents, ...workspaceAgents];

      return agents as V extends "full"
        ? AgentConfigurationType[]
        : LightAgentConfigurationType[];
    });
  }

  /**
   * Retrieves one specific version of an agent (can be the latest one).
   */
  static async getAgentConfiguration<V extends AgentFetchVariant>(
    auth: Authenticator,
    {
      agentId,
      agentVersion,
      variant,
      globalAgentContext,
      dangerouslySkipPermissionFiltering,
    }: {
      agentId: string;
      agentVersion?: number;
      variant: V;
      globalAgentContext?: GlobalAgentContext;
      dangerouslySkipPermissionFiltering?: boolean;
    }
  ): Promise<
    | (V extends "light" ? LightAgentConfigurationType : AgentConfigurationType)
    | null
  > {
    return tracer.trace("getAgentConfiguration", async () => {
      if (agentVersion !== undefined && !isGlobalAgentId(agentId)) {
        const [agent] = await AgentResource.getAgentConfigurationsWithVersion(
          auth,
          [{ agentId, agentVersion }],
          {
            variant,
            dangerouslySkipPermissionFiltering,
          }
        );
        return (
          (agent as V extends "light"
            ? LightAgentConfigurationType
            : AgentConfigurationType) || null
        );
      }
      const [agent] = await AgentResource.getAgentConfigurations(auth, {
        agentIds: [agentId],
        variant,
        globalAgentContext,
        dangerouslySkipPermissionFiltering,
      });
      return (
        (agent as V extends "light"
          ? LightAgentConfigurationType
          : AgentConfigurationType) || null
      );
    });
  }

  /**
   * Retrieves the latest version of an agent for the caller's details view. Callers only get agents
   * they can read, except admins: they can list every agent of the workspace (see the
   * `manage_unrestricted` view), so they get the ones they cannot read too, with the private fields
   * redacted (see `redactPrivateAgentConfigurationFields`). Returns null when the agent does not
   * exist or is not readable by a non-admin caller.
   */
  static async getAgentConfigurationForDetails(
    auth: Authenticator,
    { agentId }: { agentId: string }
  ): Promise<AgentConfigurationType | null> {
    const agent = await AgentResource.getAgentConfiguration(auth, {
      agentId,
      variant: "full",
    });
    if (agent?.canRead) {
      return agent;
    }

    if (!auth.isAdmin()) {
      return null;
    }

    // Either not readable (unpublished, not an editor) or filtered out by a space the admin is not a
    // member of: refetch without the space filtering to redact it. The light variant is enough, the
    // full one only adds fields the redaction drops.
    const restrictedAgent =
      agent ??
      (await AgentResource.getAgentConfiguration(auth, {
        agentId,
        variant: "light",
        dangerouslySkipPermissionFiltering: true,
      }));

    return restrictedAgent
      ? AgentResource.redactPrivateAgentConfigurationFields(restrictedAgent)
      : null;
  }

  static async getAgentLabelsByIds(
    auth: Authenticator,
    agentIds: string[]
  ): Promise<AgentLabel[]> {
    if (!auth.isManager()) {
      return [];
    }

    const workspaceAgentIds = agentIds.filter((id) => !isGlobalAgentId(id));
    const agentModels = await AgentResource.fetchLatestWorkspaceAgentModels(
      auth,
      workspaceAgentIds
    );

    return agentModels.map((agent) => ({
      sId: agent.sId,
      name: agent.name,
      authorModelId: agent.authorId,
      pictureUrl: agent.pictureUrl,
      model: AgentResource.toModelJSON(agent),
      scope: agent.scope,
    }));
  }

  /**
   * Search agent configurations by name.
   */
  static async searchAgentConfigurationsByName(
    auth: Authenticator,
    name: string
  ): Promise<LightAgentConfigurationType[]> {
    const owner = auth.getNonNullableWorkspace();

    const agentConfigurations = await AgentConfigurationModel.findAll({
      where: {
        workspaceId: owner.id,
        status: "active",
        scope: { [Op.in]: ["workspace", "published", "visible"] },
        name: {
          [Op.iLike]: `%${name}%`,
        },
      },
    });
    const agents = await AgentResource.getAgentConfigurations(auth, {
      agentIds: agentConfigurations.map(({ sId }) => sId),
      variant: "light",
    });

    return removeNulls(agents);
  }

  /**
   * Resolve an agent configuration sId from a name. Searches workspace agents and
   * global agents (case-insensitive substring), preferring an exact match. Returns
   * null when no agent matches.
   */
  static async resolveAgentConfigurationIdByName(
    auth: Authenticator,
    agentName: string
  ): Promise<string | null> {
    const normalizedAgentName = agentName.trim().toLowerCase();
    if (
      normalizedAgentName === "dust" ||
      normalizedAgentName === "dust agent"
    ) {
      return GLOBAL_AGENTS_SID.DUST;
    }

    const workspaceMatches =
      await AgentResource.searchAgentConfigurationsByName(auth, agentName);
    const globalAgents = await getGlobalAgents(auth, undefined, "light");
    const globalMatches = globalAgents.filter((a) =>
      a.name.toLowerCase().includes(normalizedAgentName)
    );
    const matches = [...workspaceMatches, ...globalMatches];
    if (matches.length === 0) {
      return null;
    }

    // Prefer exact case-insensitive match, otherwise fallback to first result.
    const exactMatch = matches.find(
      (a) => a.name.trim().toLowerCase() === normalizedAgentName
    );
    return exactMatch?.sId ?? matches[0].sId;
  }

  /**
   * @cc [owner:aubin-tchoi,label:backend;concurrency] atomic-agent-version
   * Publishing a new version commits its configuration, editor grants, tags, tools and skills
   * together; a failed write leaves the previous version and its relationships unchanged.
   */
  static async createAgentConfiguration(
    auth: Authenticator,
    {
      name,
      description,
      instructions,
      instructionsHtml,
      pictureUrl,
      status,
      scope,
      model,
      agentConfigurationId,
      templateId,
      requestedSpaceIds,
      tags,
      editors,
      authorId,
      reinforcement,
      actions = [],
      skills = [],
    }: {
      name: string;
      description: string;
      instructions: string | null;
      instructionsHtml: string | null;
      pictureUrl: string;
      status: AgentStatus;
      scope: Exclude<AgentConfigurationScope, "global">;
      model: AgentModelConfigurationType;
      agentConfigurationId?: string;
      templateId: string | null;
      requestedSpaceIds: number[];
      tags: TagType[];
      editors: UserType[];
      authorId: ModelId;
      reinforcement?: AgentReinforcementMode;
      actions?: UnsavedServerSideMCPServerConfigurationType[];
      skills?: SkillResource[];
    },
    transaction?: Transaction
  ): Promise<Result<AgentConfigurationType, Error>> {
    const owner = auth.workspace();
    if (!owner) {
      throw new Error("Unexpected `auth` without `workspace`.");
    }

    const isValidPictureUrl =
      await AgentResource.isSelfHostedImageWithValidContentType(pictureUrl);
    if (!isValidPictureUrl) {
      return new Err(new Error("Invalid picture url."));
    }

    if (model.responseFormat) {
      const formatValidation = validateResponseFormat(model.responseFormat);
      if (!formatValidation.isValid) {
        return new Err(
          new Error(`Invalid response format: ${formatValidation.errorMessage}`)
        );
      }
    }

    const serverViews = await MCPServerViewResource.fetchByIds(
      auth,
      actions.map((action) => action.mcpServerViewId)
    );
    const serverViewById = new Map(serverViews.map((view) => [view.sId, view]));
    if (actions.some((action) => !serverViewById.has(action.mcpServerViewId))) {
      return new Err(new Error("MCP server view not found"));
    }
    assert(skills.every((skill) => skill.workspaceId === owner.id));
    const createdActions: MCPServerConfigurationType[] = [];

    let version = 0;

    let userFavorite = false;

    // Track removed editors so their triggers can be disabled if this save leaves the agent hidden.
    let removedEditors: UserType[] = [];
    // The scope the agent has before this write. A new agent starts hidden, so saving it
    // visible counts as publishing.
    let currentScope: AgentConfigurationScope = "hidden";
    if (agentConfigurationId) {
      const existingAgent = await AgentResource.getAgentConfiguration(auth, {
        agentId: agentConfigurationId,
        variant: "light",
      });
      if (existingAgent) {
        currentScope = existingAgent.scope;
      }
    }

    if (
      AgentResource.needsPublishPermission({
        currentScope,
        newScope: scope,
        isActive: status === "active",
      })
    ) {
      const { canPublish, message } = await AgentResource.canPublishAgent(auth);
      if (!canPublish) {
        return new Err(
          new Error(message ?? "You don't have permission to publish agents.")
        );
      }
    }

    try {
      let template: TemplateResource | null = null;
      if (templateId) {
        template = await TemplateResource.fetchByExternalId(templateId);
      }
      const performCreation = async (
        t: Transaction
      ): Promise<AgentConfigurationModel> => {
        let existingAgent = null;

        if (agentConfigurationId) {
          // Serialize upgrades on the stable identity, not a version row that is replaced.
          await AgentModel.findOne({
            where: { sId: agentConfigurationId, workspaceId: owner.id },
            attributes: ["id"],
            transaction: t,
            lock: t.LOCK.UPDATE,
          });
          const [agentConfiguration, userRelation] = await Promise.all([
            AgentConfigurationModel.findOne({
              where: {
                sId: agentConfigurationId,
                workspaceId: owner.id,
              },
              attributes: [
                "agentId",
                "scope",
                "version",
                "id",
                "sId",
                "status",
                "authorId",
                "workspaceId",
                "createdAt",
                "reinforcement",
              ],
              order: [["version", "DESC"]],
              transaction: t,
              limit: 1,
            }),
            AgentUserRelationModel.findOne({
              where: {
                workspaceId: owner.id,
                agentConfiguration: agentConfigurationId,
                userId: authorId,
              },
              transaction: t,
            }),
          ]);

          existingAgent = agentConfiguration;

          if (existingAgent) {
            if (existingAgent.status === "archived") {
              throw new Error(
                "An archived agent cannot be updated. Restore it first."
              );
            }

            // Handle pending agent: update in place (don't bump version, preserve id for FK relationships)
            // Otherwise: archive old versions and bump version
            if (existingAgent.status === "pending") {
              if (existingAgent.authorId === authorId) {
                const timeToCreationMs =
                  Date.now() - existingAgent.createdAt.getTime();
                logger.info(
                  {
                    agentId: existingAgent.sId,
                    workspaceId: owner.sId,
                    timeToCreationMs,
                  },
                  "Agent created from pending status"
                );
              } else {
                throw new Error(
                  "Cannot update a pending agent owned by another user."
                );
              }
            } else {
              // Regular update: bump version and archive old versions
              version = existingAgent.version + 1;
              await AgentConfigurationModel.update(
                { status: "archived" },
                {
                  where: {
                    sId: agentConfigurationId,
                    workspaceId: owner.id,
                  },
                  transaction: t,
                }
              );
            }
          }

          userFavorite = userRelation?.favorite ?? false;
        }

        // `existingAgent` is null both when no `agentConfigurationId` was given and when one was
        // given but didn't match a real row — the latter would otherwise let a caller bypass the
        // capability check by passing a nonexistent id and taking the "create new" branch below.
        if (!existingAgent) {
          const canCreate = await auth.hasWorkspacePermission(
            "create",
            "agent"
          );
          if (!canCreate) {
            throw new Error("Creating agents is restricted.");
          }
        }

        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        const sId = agentConfigurationId || generateRandomModelSId();
        let agentModelId = existingAgent?.agentId;
        if (!agentModelId) {
          // Avoid findOrCreate's nested savepoint: Sequelize v6 mutates its parent's
          // rollback target. Let the unique index handle concurrent identity creation.
          await AgentModel.bulkCreate([{ sId, workspaceId: owner.id }], {
            ignoreDuplicates: true,
            transaction: t,
          });
          const agentIdentity = await AgentModel.findOne({
            where: { sId, workspaceId: owner.id },
            transaction: t,
            lock: t.LOCK.UPDATE,
          });
          assert(
            agentIdentity,
            "The stable agent identity must exist after insertion."
          );
          agentModelId = agentIdentity.id;
          await AgentConfigurationModel.update(
            { agentId: agentModelId },
            {
              where: { sId, workspaceId: owner.id },
              transaction: t,
            }
          );
        }

        // Create or update Agent config.
        let agentConfigurationInstance: AgentConfigurationModel;

        if (existingAgent && existingAgent.status === "pending") {
          // Update pending agent in place to preserve id (and FK relationships like suggestions)
          await AgentConfigurationModel.update(
            {
              version,
              status,
              scope,
              name,
              description,
              instructions,
              instructionsHtml,
              providerId: model.providerId,
              modelId: model.modelId,
              temperature: model.temperature,
              reasoningEffort: model.reasoningEffort,
              maxStepsPerRun: MAX_STEPS_USE_PER_RUN_LIMIT,
              pictureUrl,
              authorId,
              templateId: template?.id,
              requestedSpaceIds: requestedSpaceIds,
              responseFormat: model.responseFormat,
              reinforcement:
                reinforcement ?? existingAgent.reinforcement ?? "auto",
            },
            {
              where: {
                id: existingAgent.id,
                workspaceId: owner.id,
              },
              transaction: t,
            }
          );
          // Reload the updated instance
          const updatedAgent = await AgentConfigurationModel.findOne({
            where: {
              id: existingAgent.id,
              workspaceId: owner.id,
            },
            transaction: t,
          });
          if (!updatedAgent) {
            throw new Error("Failed to reload updated agent configuration");
          }
          agentConfigurationInstance = updatedAgent;
        } else {
          // Create new agent config
          agentConfigurationInstance = await AgentConfigurationModel.create(
            {
              sId,
              agentId: agentModelId,
              version,
              status,
              scope,
              name,
              description,
              instructions,
              instructionsHtml,
              providerId: model.providerId,
              modelId: model.modelId,
              temperature: model.temperature,
              reasoningEffort: model.reasoningEffort,
              maxStepsPerRun: MAX_STEPS_USE_PER_RUN_LIMIT,
              pictureUrl,
              workspaceId: owner.id,
              authorId,
              templateId: template?.id,
              requestedSpaceIds: requestedSpaceIds,
              responseFormat: model.responseFormat,
              reinforcement:
                reinforcement ?? existingAgent?.reinforcement ?? "auto",
            },
            {
              transaction: t,
            }
          );
        }

        const canManageProtectedTags = await auth.hasWorkspacePermission(
          "publish",
          "agent"
        );

        const existingTags = existingAgent
          ? await TagResource.listForAgent(auth, existingAgent.id, {
              transaction: t,
            })
          : [];
        const existingReservedTags = new Set(
          existingTags
            .filter((tag) => tag.kind === "protected")
            .map((tag) => tag.sId)
        );
        const requestedTagIds = new Set(tags.map((tag) => tag.sId));
        if (
          !canManageProtectedTags &&
          ![...existingReservedTags].every((reservedTagId) =>
            requestedTagIds.has(reservedTagId)
          )
        ) {
          throw new Error("Cannot remove reserved tag from agent");
        }

        if (status === "active") {
          const tagResources = await TagResource.fetchByIds(
            auth,
            tags.map((tag) => tag.sId),
            { transaction: t }
          );
          const tagResourceById = new Map(
            tagResources.map((tagResource) => [tagResource.sId, tagResource])
          );

          const tagsToAttach = removeNulls(
            tags.map((tag) => tagResourceById.get(tag.sId))
          );
          if (
            !canManageProtectedTags &&
            tagsToAttach.some(
              (tag) =>
                tag.kind === "protected" && !existingReservedTags.has(tag.sId)
            )
          ) {
            throw new Error("Cannot add reserved tag to agent");
          }
          if (tagsToAttach.length > 0) {
            await TagAgentModel.bulkCreate(
              tagsToAttach.map((tag) => ({
                workspaceId: owner.id,
                tagId: tag.id,
                agentConfigurationId: agentConfigurationInstance.id,
              })),
              { transaction: t }
            );
          }

          assert(
            editors.some((e) => e.id === authorId) || isAdmin(owner),
            "Unexpected: author must be in editor group or admin"
          );
          if (!existingAgent) {
            const group = await GroupResource.makeNewAgentEditorsGroup(
              auth,
              agentConfigurationInstance,
              { transaction: t, authorId }
            );
            // No need to check on permission here since it was done a few lines above.
            const setMembersRes = await group.dangerouslySetMembers(auth, {
              users: editors,
              transaction: t,
            });
            if (setMembersRes.isErr()) {
              throw setMembersRes.error;
            }
          } else {
            const group = await GroupResource.fetchByAgentConfiguration({
              auth,
              agentConfiguration: existingAgent,
              transaction: t,
            });
            if (!group) {
              throw new Error(
                "Unexpected: agent should have exactly one editor group."
              );
            }
            // For pending agents updated in place, the group is already linked to the same agent ID
            // For regular updates, we need to link the group to the new agent configuration
            if (existingAgent.id !== agentConfigurationInstance.id) {
              const result = await group.addGroupToAgentConfiguration({
                auth,
                agentConfiguration: agentConfigurationInstance,
                transaction: t,
              });
              if (result.isErr()) {
                logger.error(
                  {
                    workspaceId: owner.sId,
                    agentConfigurationId: existingAgent.sId,
                  },
                  `Error adding group to agent ${existingAgent.sId}: ${result.error}`
                );
                throw result.error;
              }
            }

            // Authorization is enforced by the `editors.some(...) || isAdmin(owner)`
            // assertion earlier in this transaction; no need to re-check here.
            const setMembersRes = await group.dangerouslySetMembers(auth, {
              users: editors,
              transaction: t,
            });
            if (setMembersRes.isErr()) {
              logger.error(
                {
                  workspaceId: owner.sId,
                  agentConfigurationId: existingAgent.sId,
                },
                `Error setting members to agent ${existingAgent.sId}: ${setMembersRes.error}`
              );
              throw setMembersRes.error;
            }
            removedEditors = setMembersRes.value.removedUsers;
          }

          const agentResource = AgentResource.fromAgentConfigurationModel(
            agentConfigurationInstance
          );
          await agentResource.grantEditors(auth, { editors, transaction: t });
          await agentResource.revokeEditors(auth, {
            editors: removedEditors,
            transaction: t,
          });
        }

        const actionsForVersion =
          await AgentActionConfigurationResource.createManyWithServerViews(
            auth,
            {
              actions: actions.map((action) => {
                const mcpServerView = serverViewById.get(
                  action.mcpServerViewId
                );
                assert(mcpServerView);
                return { action, mcpServerView };
              }),
              agentConfigurationModelId: agentConfigurationInstance.id,
              transaction: t,
            }
          );
        createdActions.push(...actionsForVersion);
        if (skills.length > 0) {
          await SkillResource.addManyToAgent(
            auth,
            {
              agentConfiguration: { id: agentConfigurationInstance.id },
              skills,
            },
            { transaction: t }
          );
        }

        return agentConfigurationInstance;
      };

      const agent = await withTransaction(performCreation, transaction, {
        useSavepoint: true,
      });

      /*
       * Final rendering.
       */
      const agentConfiguration: AgentConfigurationType = {
        id: agent.id,
        sId: agent.sId,
        versionCreatedAt: agent.createdAt.toISOString(),
        version: agent.version,
        versionAuthorId: agent.authorId,
        scope: agent.scope,
        name: agent.name,
        description: agent.description,
        instructions: agent.instructions,
        instructionsHtml: agent.instructionsHtml,
        actions: createdActions,
        userFavorite,
        model: {
          providerId: agent.providerId,
          modelId: agent.modelId,
          temperature: agent.temperature,
          responseFormat: agent.responseFormat,
        },
        pictureUrl: agent.pictureUrl,
        status: agent.status,
        maxStepsPerRun: agent.maxStepsPerRun,
        templateId: template?.sId ?? null,
        requestedGroupIds: [],
        requestedSpaceIds: agent.requestedSpaceIds.map((spaceId) =>
          SpaceResource.modelIdToSId({ id: spaceId, workspaceId: owner.id })
        ),
        tags,
        reinforcement: reinforcement ?? "auto",
        canRead: true,
        canEdit: true,
      };

      await runAfterTransactionCommit(transaction, async () => {
        await auth.refresh();
        await agentConfigurationWasUpdatedBy({
          agent: agentConfiguration,
          auth,
        });

        // Disable triggers for editors who were removed from a hidden agent.
        if (removedEditors.length > 0 && scope === "hidden") {
          const triggersToDisableRes =
            await TriggerResource.listByAgentConfigurationIdAndEditors(auth, {
              agentConfigurationId: agent.sId,
              editorIds: removedEditors.map((editor) => editor.id),
            });
          if (triggersToDisableRes.isOk()) {
            for (const trigger of triggersToDisableRes.value) {
              const disableResult = await trigger.disable(auth);
              if (disableResult.isErr()) {
                logger.error(
                  {
                    workspaceId: owner.sId,
                    agentConfigurationId: agent.sId,
                    triggerId: trigger.sId,
                    error: disableResult.error,
                  },
                  `Failed to disable trigger ${trigger.sId} when removing editor from agent ${agent.sId}`
                );
              }
            }
          }
        }

        if (agentConfiguration.status === "active") {
          const isCreate =
            !agentConfigurationId || agentConfiguration.version === 0;
          void emitAuditLogEvent({
            auth,
            action: isCreate ? "agent.created" : "agent.updated",
            targets: [
              buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
              buildAuditLogTarget("agent", agentConfiguration),
            ],
            context: getAuditLogContext(auth),
            metadata: {
              agent_name: agentConfiguration.name,
              scope: scope,
              model: `${model.providerId}/${model.modelId}`,
            },
          });
        }
        await AgentResource.launchSearchIndexation(auth, [agent.sId]);
      });

      return new Ok(agentConfiguration);
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        return new Err(new Error("An agent with this name already exists."));
      }
      if (error instanceof ValidationError) {
        return new Err(new Error(error.message));
      }
      if (error instanceof SyntaxError) {
        return new Err(new Error(error.message));
      }
      if (error instanceof DustError) {
        return new Err(error);
      }
      if (error instanceof Error) {
        return new Err(error);
      }
      throw error;
    }
  }

  // Cancels every still-scheduled wake-up targeting the given agent, deleting the
  // backing Temporal schedule (cron) or pending workflow (one-shot). Errors are
  // logged but do not abort the caller.
  private static async cancelWakeUpsForAgent(
    auth: Authenticator,
    agentConfigurationId: string
  ): Promise<void> {
    const workspace = auth.getNonNullableWorkspace();
    const wakeUps = await WakeUpResource.listByAgentConfigurationId(
      auth,
      agentConfigurationId
    );

    await concurrentExecutor(
      wakeUps,
      async (wakeUp) => {
        const cancelResult = await wakeUp.forceCancel(auth);
        if (cancelResult.isErr()) {
          logger.error(
            {
              workspaceId: workspace.sId,
              agentConfigurationId,
              wakeUpId: wakeUp.sId,
              error: cancelResult.error,
            },
            `Failed to cancel wake-up ${wakeUp.sId} for agent ${agentConfigurationId}`
          );
        }
      },
      { concurrency: 5 }
    );
  }

  static async archiveAgentConfiguration(
    auth: Authenticator,
    agentConfigurationId: string,
    {
      dangerouslySkipPermissionFiltering,
    }: ArchiveAgentConfigurationOptions = {}
  ): Promise<boolean> {
    const owner = auth.workspace();
    if (!owner) {
      throw new Error("Unexpected `auth` without `workspace`.");
    }

    const agentConfig = await AgentResource.getAgentConfiguration(auth, {
      agentId: agentConfigurationId,
      variant: "light",
      dangerouslySkipPermissionFiltering,
    });

    if (!agentConfig) {
      throw new Error(`Could not find agent ${agentConfigurationId}`);
    }

    // Disable all triggers for this agent before archiving
    const triggers = await TriggerResource.listByAgentConfigurationId(
      auth,
      agentConfigurationId
    );
    for (const trigger of triggers) {
      const disableResult = await trigger.disable(auth);
      if (disableResult.isErr()) {
        logger.error(
          {
            workspaceId: owner.sId,
            agentConfigurationId,
            triggerId: trigger.sId,
            error: disableResult.error,
          },
          `Failed to disable trigger ${trigger.sId} when archiving agent ${agentConfigurationId}`
        );
      }
    }

    await AgentResource.cancelWakeUpsForAgent(auth, agentConfigurationId);

    const updated = await AgentConfigurationModel.update(
      { status: "archived" },
      {
        where: {
          sId: agentConfigurationId,
          workspaceId: owner.id,
        },
      }
    );

    if (updated[0] > 0) {
      await AgentResource.launchSearchIndexation(auth, [agentConfigurationId]);
      void emitAuditLogEvent({
        auth,
        action: "agent.archived",
        targets: [
          buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
          buildAuditLogTarget("agent", agentConfig),
        ],
        context: getAuditLogContext(auth),
        metadata: {
          agent_name: agentConfig.name,
        },
      });
    }

    const affectedCount = updated[0];
    return affectedCount > 0;
  }

  static async restoreAgentConfiguration(
    auth: Authenticator,
    agentConfigurationId: string
  ): Promise<
    Result<
      { restored: boolean },
      DustError<"name_conflict" | "internal_error" | "unauthorized">
    >
  > {
    const owner = auth.getNonNullableWorkspace();

    const latestConfig = await AgentConfigurationModel.findOne({
      where: {
        sId: agentConfigurationId,
        workspaceId: owner.id,
      },
      order: [["version", "DESC"]],
      limit: 1,
    });
    if (!latestConfig) {
      return new Err(
        new DustError("internal_error", "Could not find agent configuration")
      );
    }
    if (latestConfig.status !== "archived") {
      return new Err(
        new DustError("internal_error", "Agent configuration is not archived")
      );
    }

    // Check publishing restrictions: restoring a visible agent is equivalent to publishing it.
    if (latestConfig.scope === "visible") {
      const { canPublish, message } = await AgentResource.canPublishAgent(auth);
      if (!canPublish) {
        return new Err(
          new DustError(
            "unauthorized",
            message ?? "Publishing agents is restricted."
          )
        );
      }
    }

    // Check for an active agent with the same name to avoid a unique constraint violation on
    // (workspaceId, name) during the update.
    const existingActive = await AgentConfigurationModel.findOne({
      where: {
        workspaceId: owner.id,
        name: latestConfig.name,
        status: "active",
      },
    });
    if (existingActive) {
      return new Err(
        new DustError(
          "name_conflict",
          `Cannot restore: an active agent named "${latestConfig.name}" already exists.`
        )
      );
    }

    const updated = await AgentConfigurationModel.update(
      {
        status: "active",
      },
      {
        where: {
          id: latestConfig.id,
          workspaceId: owner.id,
        },
      }
    );

    // Re-enable triggers.
    if (updated[0] > 0) {
      await AgentResource.launchSearchIndexation(auth, [agentConfigurationId]);
      const triggers = await TriggerResource.listByAgentConfigurationId(
        auth,
        agentConfigurationId
      );
      const editors = await UserResource.fetchByModelIds([
        ...new Set(triggers.map((trigger) => trigger.editor)),
      ]);
      const editorByModelId = new Map(
        editors.map((editor) => [editor.id, editor])
      );

      for (const trigger of triggers) {
        const editor = editorByModelId.get(trigger.editor);
        if (!editor) {
          logger.error(
            {
              workspaceId: owner.sId,
              agentConfigurationId,
              triggerId: trigger.sId,
            },
            `Could not find editor ${trigger.editor} for trigger ${trigger.sId} when restoring agent ${agentConfigurationId}`
          );
          continue;
        }

        const editorAuth = await Authenticator.fromUserIdAndWorkspaceId(
          editor.sId,
          auth.getNonNullableWorkspace().sId
        );
        const enableResult = await trigger.enable(editorAuth);
        if (enableResult.isErr()) {
          logger.error(
            {
              workspaceId: owner.sId,
              agentConfigurationId,
              triggerId: trigger.sId,
              error: enableResult.error,
            },
            `Failed to enable trigger ${trigger.sId} when restoring agent ${agentConfigurationId}`
          );
        }
      }
    }

    if (updated[0] > 0) {
      void emitAuditLogEvent({
        auth,
        action: "agent.restored",
        targets: [
          buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
          buildAuditLogTarget("agent", latestConfig),
        ],
        context: getAuditLogContext(auth),
        metadata: {
          agent_name: latestConfig.name,
        },
      });
    }

    return new Ok({ restored: updated[0] > 0 });
  }

  // Deletes the agent-scoped resources that are keyed by the agent sId (stable
  // across versions) and therefore have no DB foreign key to cascade on: triggers
  // (with their Temporal schedule), wake-ups (with their Temporal schedule /
  // pending workflow) and favorite / agent-user-relation rows.
  static async cleanupAgentScopedResourcesForHardDeletion(
    auth: Authenticator,
    agentConfigurationId: string
  ): Promise<void> {
    const workspace = auth.getNonNullableWorkspace();

    const triggers = await TriggerResource.listByAgentConfigurationId(
      auth,
      agentConfigurationId
    );
    await concurrentExecutor(
      triggers,
      async (trigger) => {
        const deleteResult = await trigger.delete(auth);
        if (deleteResult.isErr()) {
          logger.error(
            {
              workspaceId: workspace.sId,
              agentConfigurationId,
              triggerId: trigger.sId,
              error: deleteResult.error,
            },
            `Failed to delete trigger ${trigger.sId} while hard-deleting agent ${agentConfigurationId}`
          );
        }
      },
      { concurrency: 4 }
    );

    const wakeUps = await WakeUpResource.listByAgentConfigurationId(
      auth,
      agentConfigurationId
    );
    const deletableWakeUpIds: ModelId[] = [];
    for (const wakeUp of wakeUps) {
      const cleanupResult = await wakeUp.forceCancel(auth);
      if (cleanupResult.isErr()) {
        logger.error(
          {
            workspaceId: workspace.sId,
            agentConfigurationId,
            wakeUpId: wakeUp.sId,
            error: cleanupResult.error,
          },
          `Failed cleaning up wake-up ${wakeUp.sId} Temporal state while hard-deleting agent ${agentConfigurationId}; leaving row for retry`
        );
        continue;
      }
      deletableWakeUpIds.push(wakeUp.id);
    }
    await WakeUpResource.deleteByModelIds(auth, deletableWakeUpIds);

    await AgentUserRelationResource.deleteForAgent(auth, agentConfigurationId);
  }

  /**
   * @cc [owner:aubin-tchoi,label:backend;security] last-agent-version-cleanup
   * Stable identity, grants, favorites and memory are removed only when no configuration
   * remains; surviving versions retain their logical-agent relationships.
   */
  private static async deleteUnusedAgentIdentities(
    auth: Authenticator,
    identities: AgentModel[],
    transaction: Transaction
  ): Promise<void> {
    if (identities.length === 0) {
      return;
    }
    const workspaceId = auth.getNonNullableWorkspace().id;
    const remaining = await AgentConfigurationModel.findAll({
      attributes: ["agentId"],
      where: { workspaceId, agentId: identities.map((agent) => agent.id) },
      group: ["agentId"],
      transaction,
    });
    const usedIds = new Set(
      remaining.map((configuration) => configuration.agentId)
    );
    const unused = identities.filter((agent) => !usedIds.has(agent.id));
    if (unused.length === 0) {
      return;
    }
    const modelIds = unused.map((agent) => agent.id);
    const agentIds = unused.map((agent) => agent.sId);
    const grantGroups =
      await GroupPermissionResource.listRegularAutoGroupsForResources(auth, {
        resourceType: "agent",
        resourceIds: modelIds,
        transaction,
      });
    await GroupPermissionResource.deleteAllForResources(auth, {
      resourceType: "agent",
      resourceIds: modelIds,
      transaction,
    });
    const deletedGroups = await GroupResource.deleteMany(auth, grantGroups, {
      transaction,
    });
    if (deletedGroups.isErr()) {
      throw deletedGroups.error;
    }
    await AgentUserRelationResource.deleteForAgents(agentIds, {
      workspaceId,
      transaction,
    });
    await AgentMemoryResource.deleteForAgents(auth, agentIds, { transaction });
    await AgentModel.destroy({
      where: { workspaceId, id: modelIds },
      transaction,
    });
  }

  /**
   * @cc [owner:aubin-tchoi,label:backend;security;performance] atomic-agent-configuration-deletion
   * Selected workspace configuration rows and their dependent records are deleted atomically
   * with batched queries; shared editor groups and logical identities survive while referenced.
   * Callers enqueue search refreshes only after the outer commit; dry runs never write.
   */
  private static async deleteConfigurationRows(
    auth: Authenticator,
    where: WhereOptions<AgentConfigurationModel>,
    transaction: Transaction,
    { dryRun = false }: { dryRun?: boolean } = {}
  ): Promise<{ configurationCount: number; agentIds: string[] }> {
    const workspaceId = auth.getNonNullableWorkspace().id;
    const selected = await AgentConfigurationModel.findAll({
      attributes: ["id", "sId", "agentId"],
      where: { ...where, workspaceId },
      transaction,
    });
    const agentIds = [...new Set(selected.map((agent) => agent.sId))];
    if (dryRun || selected.length === 0) {
      return { configurationCount: selected.length, agentIds };
    }
    // Lock stable identities before configuration rows, matching the version-creation order.
    const identities = await AgentModel.findAll({
      where: {
        workspaceId,
        id: [...new Set(selected.map((agent) => agent.agentId))],
      },
      transaction,
      lock: transaction.LOCK.UPDATE,
      order: [["id", "ASC"]],
    });
    const configurations = await AgentConfigurationModel.findAll({
      attributes: ["id"],
      where: { ...where, workspaceId, id: selected.map((agent) => agent.id) },
      transaction,
      lock: transaction.LOCK.UPDATE,
      order: [["id", "ASC"]],
    });
    const ids = configurations.map((agent) => agent.id);
    const links = await GroupAgentModel.findAll({
      attributes: ["groupId"],
      where: { workspaceId, agentConfigurationId: ids },
      transaction,
    });
    const groupIds = [...new Set(links.map((link) => link.groupId))];

    await AgentActionConfigurationResource.deleteForConfigurations(auth, ids, {
      transaction,
    });
    const versionOptions = {
      where: { workspaceId, agentConfigurationId: ids },
      transaction,
    };
    await AgentSkillModel.destroy(versionOptions);
    await TagAgentModel.destroy(versionOptions);
    await AgentSuggestionModel.destroy(versionOptions);
    await GroupAgentModel.destroy(versionOptions);
    const configurationCount = await AgentConfigurationModel.destroy({
      where: { workspaceId, id: ids },
      transaction,
    });

    if (groupIds.length > 0) {
      const remainingLinks = await GroupAgentModel.findAll({
        attributes: ["groupId"],
        where: { workspaceId, groupId: groupIds },
        transaction,
      });
      const usedGroupIds = new Set(remainingLinks.map((link) => link.groupId));
      const unusedGroups = await GroupResource.dangerouslyFetchByModelIds(
        auth,
        groupIds.filter((id) => !usedGroupIds.has(id)),
        { groupKinds: ["agent_editors"], transaction }
      );
      const deletedGroups = await GroupResource.deleteMany(auth, unusedGroups, {
        transaction,
      });
      if (deletedGroups.isErr()) {
        throw deletedGroups.error;
      }
    }
    await this.deleteUnusedAgentIdentities(auth, identities, transaction);
    return { configurationCount, agentIds };
  }

  // Also used by the operator scrub path to delete explicitly selected versions.
  static async unsafeHardDeleteAgentConfiguration(
    auth: Authenticator,
    agentConfiguration: LightAgentConfigurationType,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<void> {
    await withTransaction(
      (t) =>
        this.deleteConfigurationRows(auth, { id: agentConfiguration.id }, t),
      transaction,
      { useSavepoint: true }
    );
    // Keep the supplied target on retry, even if the rows were already removed.
    await this.launchSearchIndexation(auth, [agentConfiguration.sId], {
      transaction,
    });
  }

  static async batchHardDeletePendingAgentConfigurations(
    auth: Authenticator,
    agents: readonly Pick<LightAgentConfigurationType, "id" | "sId">[]
  ): Promise<void> {
    await withTransaction((transaction) =>
      this.deleteConfigurationRows(
        auth,
        {
          id: agents.map((agent) => agent.id),
          status: "pending",
        },
        transaction
      )
    );
    // Preserve targets when retrying after deletion committed but enqueueing failed.
    await this.launchSearchIndexation(
      auth,
      agents.map((agent) => agent.sId)
    );
  }

  // Operator-only maintenance: author filtering applies to configuration versions, not
  // to the whole logical agent. Other authors' versions and their shared state survive.
  static async deleteConfigurationsByAuthor(
    auth: Authenticator,
    {
      authorModelId,
      dryRun = false,
    }: { authorModelId: ModelId; dryRun?: boolean }
  ): Promise<{ configurationCount: number; agentIds: string[] }> {
    assert(
      auth.isAdmin(),
      "Only admins can delete agent configurations by author."
    );
    const result = await withTransaction((transaction) =>
      this.deleteConfigurationRows(
        auth,
        { authorId: authorModelId },
        transaction,
        { dryRun }
      )
    );
    if (!dryRun) {
      await this.launchSearchIndexation(auth, result.agentIds);
    }
    return result;
  }

  static async deleteAllForWorkspace(auth: Authenticator): Promise<void> {
    assert(auth.isAdmin(), "Only admins can delete all workspace agents.");
    const workspace = auth.getNonNullableWorkspace();
    await withTransaction(async (transaction) => {
      await this.deleteConfigurationRows(auth, {}, transaction);
      await AgentSuggestionModel.destroy({
        where: { workspaceId: workspace.id },
        transaction,
      });
      await AgentUserRelationResource.deleteAllForWorkspace(auth, {
        transaction,
      });
      // Include any orphaned identities left by legacy version-row deletion paths.
      const identities = await AgentModel.findAll({
        where: { workspaceId: workspace.id },
        transaction,
        lock: transaction.LOCK.UPDATE,
        order: [["id", "ASC"]],
      });
      await this.deleteUnusedAgentIdentities(auth, identities, transaction);
      await GlobalAgentSettingsResource.deleteAllForWorkspace(auth, {
        transaction,
      });
    });
    await AgentSearchIndexationResource.deleteWorkspace(workspace.sId);
  }

  /**
   * @cc [owner:aubin-tchoi,label:backend;security] unused-draft-maintenance
   * Admin cleanup selects only workspace draft versions without recorded mentions;
   * deletion uses the normal atomic version cleanup, and dry runs perform no writes or indexation.
   */
  static async deleteUnusedDraftConfigurations(
    auth: Authenticator,
    { dryRun = false }: { dryRun?: boolean } = {}
  ): Promise<{ configurationCount: number; skippedCount: number }> {
    assert(auth.isAdmin(), "Only admins can clean up draft agents.");
    const workspaceId = auth.getNonNullableWorkspace().id;
    const result = await withTransaction(async (transaction) => {
      const drafts = await AgentConfigurationModel.findAll({
        attributes: ["id", "sId"],
        where: { workspaceId, status: "draft" },
        transaction,
      });
      if (drafts.length === 0) {
        return { configurationCount: 0, skippedCount: 0, agentIds: [] };
      }
      const mentions = await MentionModel.findAll({
        attributes: ["agentConfigurationId"],
        where: {
          workspaceId,
          agentConfigurationId: [...new Set(drafts.map((agent) => agent.sId))],
        },
        group: ["agentConfigurationId"],
        transaction,
      });
      const mentionedIds = new Set(
        mentions.map((mention) => mention.agentConfigurationId)
      );
      const unused = drafts.filter((agent) => !mentionedIds.has(agent.sId));
      const deleted = await this.deleteConfigurationRows(
        auth,
        { id: unused.map((agent) => agent.id), status: "draft" },
        transaction,
        { dryRun }
      );
      return { ...deleted, skippedCount: drafts.length - unused.length };
    });
    if (!dryRun) {
      await this.launchSearchIndexation(auth, result.agentIds);
    }
    return {
      configurationCount: result.configurationCount,
      skippedCount: result.skippedCount,
    };
  }

  /**
   * @cc [owner:aubin-tchoi,label:backend;security] orphaned-agent-space-repair
   * Admin repair removes only missing or foreign-workspace space IDs from active configurations,
   * preserving all other fields; writes are locked and batched, dry runs never write, and indexing
   * starts after commit.
   */
  static async repairOrphanedSpaceRequirements(
    auth: Authenticator,
    { dryRun = false }: { dryRun?: boolean } = {}
  ): Promise<{ configurationCount: number; agentIds: string[] }> {
    assert(auth.isAdmin(), "Only admins can repair agent space requirements.");
    const workspace = auth.getNonNullableWorkspace();
    const result = await withTransaction(async (transaction) => {
      // Full rows are retained for the locked bulk upsert, which updates requestedSpaceIds only.
      const agents = await AgentConfigurationModel.findAll({
        where: { workspaceId: workspace.id, status: "active" },
        transaction,
        ...(dryRun ? {} : { lock: transaction.LOCK.UPDATE }),
        order: [["id", "ASC"]],
      });
      const spaceModelIds = [
        ...new Set(agents.flatMap((agent) => agent.requestedSpaceIds)),
      ];
      const spaces = await SpaceResource.fetchByIds(
        auth,
        spaceModelIds.map((id) =>
          SpaceResource.modelIdToSId({ id, workspaceId: workspace.id })
        ),
        { transaction }
      );
      const existingSpaceIds = new Set(spaces.map((space) => space.id));
      const repairs = removeNulls(
        agents.map((agent) => {
          const requestedSpaceIds = agent.requestedSpaceIds.filter((id) =>
            existingSpaceIds.has(id)
          );
          return requestedSpaceIds.length === agent.requestedSpaceIds.length
            ? null
            : { ...agent.get(), requestedSpaceIds };
        })
      );
      if (!dryRun && repairs.length > 0) {
        await AgentConfigurationModel.bulkCreate(repairs, {
          conflictAttributes: ["id"],
          updateOnDuplicate: ["requestedSpaceIds"],
          returning: false,
          transaction,
        });
      }
      return {
        configurationCount: repairs.length,
        agentIds: [...new Set(repairs.map((agent) => agent.sId))],
      };
    });
    if (!dryRun) {
      await this.launchSearchIndexation(auth, result.agentIds);
    }
    return result;
  }

  /**
   * @cc [owner:aubin-tchoi,label:backend;security] rebuilt-agent-space-requirements
   * Admin maintenance recomputes selected workspace configurations from their tools and skills
   * in one transaction, preserving other fields and indexing after the outer commit; dry runs
   * report changes without writing or scheduling indexation.
   */
  static async rebuildSpaceRequirements(
    auth: Authenticator,
    {
      onlyActive = true,
      agentIds = [],
      dryRun = false,
      transaction,
    }: {
      onlyActive?: boolean;
      agentIds?: string[];
      dryRun?: boolean;
      transaction?: Transaction;
    } = {}
  ): Promise<{ total: number; updated: number; agentIds: string[] }> {
    assert(auth.isAdmin(), "Only admins can rebuild agent space requirements.");
    const workspace = auth.getNonNullableWorkspace();
    const result = await withTransaction(
      async (t) => {
        const configurations = await AgentConfigurationModel.findAll({
          where: {
            workspaceId: workspace.id,
            scope: ["workspace", "published", "hidden", "visible"],
            ...(onlyActive ? { status: "active" } : {}),
            ...(agentIds.length > 0 ? { sId: agentIds } : {}),
          },
          transaction: t,
          ...(dryRun ? {} : { lock: t.LOCK.UPDATE }),
          order: [["id", "ASC"]],
        });
        if (configurations.length === 0) {
          return { total: 0, updated: 0, agentIds: [] };
        }
        const actionsByConfiguration =
          await AgentActionConfigurationResource.fetchConfigurations(auth, {
            configurationIds: configurations.map(
              (configuration) => configuration.id
            ),
            variant: "full",
            transaction: t,
          });
        const attachedSkills = await SkillResource.listByAgentConfigurations(
          auth,
          configurations.map(({ id, sId }) => ({ id, sId })),
          {
            transaction: t,
            permissionFiltering: "dangerously_skip",
            withInstructions: false,
            withTools: false,
            withFileAttachments: false,
          }
        );
        const skillsByConfiguration = new Map<ModelId, SkillResource[]>();
        for (const { agentConfiguration, skill } of attachedSkills) {
          const skills = skillsByConfiguration.get(agentConfiguration.id) ?? [];
          skills.push(skill);
          skillsByConfiguration.set(agentConfiguration.id, skills);
        }
        const requirements =
          await AgentActionConfigurationResource.getSpaceRequirements(
            auth,
            configurations.map((configuration) => ({
              actions: actionsByConfiguration.get(configuration.id) ?? [],
              skills: skillsByConfiguration.get(configuration.id) ?? [],
            })),
            { transaction: t }
          );
        const changes = removeNulls(
          configurations.map((configuration, index) => {
            const { requestedSpaceIds } = requirements[index];
            const existingIds = new Set(configuration.requestedSpaceIds);
            return existingIds.size === requestedSpaceIds.length &&
              requestedSpaceIds.every((id) => existingIds.has(id))
              ? null
              : { ...configuration.get(), requestedSpaceIds };
          })
        );
        if (!dryRun && changes.length > 0) {
          await AgentConfigurationModel.bulkCreate(changes, {
            transaction: t,
            conflictAttributes: ["id"],
            updateOnDuplicate: ["requestedSpaceIds"],
            returning: false,
          });
        }
        return {
          total: configurations.length,
          updated: changes.length,
          agentIds: [
            ...new Set(changes.map((configuration) => configuration.sId)),
          ],
        };
      },
      transaction,
      { useSavepoint: true }
    );
    if (!dryRun) {
      await this.launchSearchIndexation(auth, result.agentIds, { transaction });
    }
    return result;
  }

  /**
   * Updates the permissions (editors) for an agent configuration.
   */
  /**
   * @cc [owner:aubin-tchoi,label:backend;security] atomic-agent-editor-update
   * Legacy editor memberships and stable-agent grants change atomically; any returned
   * validation error leaves both unchanged and emits no search indexation or success audit.
   */
  static async updateAgentPermissions(
    auth: Authenticator,
    {
      agent,
      usersToAdd,
      usersToRemove,
    }: {
      agent: LightAgentConfigurationType;
      usersToAdd: UserType[];
      usersToRemove: UserType[];
    }
  ): Promise<
    Result<
      undefined,
      DustError<
        | "group_not_found"
        | "internal_error"
        | "unauthorized"
        | "invalid_id"
        | "system_or_global_group"
        | "user_not_found"
        | "user_not_member"
        | "user_already_member"
        | "group_requirements_not_met"
        | "invalid_request_error"
      >
    >
  > {
    if (agent.status === "archived") {
      return new Err(
        new DustError(
          "invalid_request_error",
          "An archived agent cannot be updated. Restore it first."
        )
      );
    }

    const editorGroupRes = await GroupResource.findEditorGroupForAgent(
      auth,
      agent
    );
    if (editorGroupRes.isErr()) {
      return editorGroupRes;
    }

    const transactionResult = await withTransactionResult(async (t) => {
      const agentResource = await AgentResource.fetchByAgentConfiguration(
        auth,
        agent,
        { transaction: t }
      );

      if (usersToAdd.length > 0) {
        // TODO(governance) replace by permission check on agent resource
        if (
          !auth.isAdmin() &&
          !(await editorGroupRes.value.isMember(auth.getNonNullableUser()))
        ) {
          return new Err(
            new DustError(
              "unauthorized",
              "Only admins or group editors can add group members"
            )
          );
        }
        const addRes = await editorGroupRes.value.dangerouslyAddMembers(auth, {
          users: usersToAdd,
          transaction: t,
        });
        if (addRes.isErr()) {
          return addRes;
        }

        await agentResource.grantEditors(auth, {
          editors: usersToAdd,
          transaction: t,
        });
      }

      if (usersToRemove.length > 0) {
        // TODO(governance) replace by permission check on agent resource
        if (
          !auth.isAdmin() &&
          !(await editorGroupRes.value.isMember(auth.getNonNullableUser()))
        ) {
          return new Err(
            new DustError(
              "unauthorized",
              "Only admins or group editors can remove group members"
            )
          );
        }
        const removeRes = await editorGroupRes.value.dangerouslyRemoveMembers(
          auth,
          {
            users: usersToRemove,
            transaction: t,
          }
        );
        if (removeRes.isErr()) {
          return removeRes;
        }

        await agentResource.revokeEditors(auth, {
          editors: usersToRemove,
          transaction: t,
        });
      }
      return new Ok(undefined);
    });

    if (transactionResult.isErr()) {
      return transactionResult;
    }
    await AgentResource.launchSearchIndexation(auth, [agent.sId]);

    // Editors get access to the agent's private data (prompt, skills, knowledge), so editor changes
    // are audited as soon as they are committed, whatever happens to the triggers below.
    // `actor_added_self` flags an admin granting themselves that access.
    const actorUserId = auth.user()?.sId;
    void emitAuditLogEvent({
      auth,
      action: "agent.editors_updated",
      targets: [
        buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
        buildAuditLogTarget("agent", agent),
      ],
      context: getAuditLogContext(auth),
      metadata: {
        agent_name: agent.name,
        scope: agent.scope,
        added_editor_ids: usersToAdd.map((u) => u.sId).join(","),
        removed_editor_ids: usersToRemove.map((u) => u.sId).join(","),
        actor_added_self: String(
          actorUserId !== undefined &&
            usersToAdd.some((u) => u.sId === actorUserId)
        ),
      },
    });

    // If the agent is hidden and editors were removed, disable their triggers.
    // Removed editors can no longer access the hidden agent, so their triggers would fail.
    if (usersToRemove.length > 0 && agent.scope === "hidden") {
      const triggersToDisable =
        await TriggerResource.listByAgentConfigurationIdAndEditors(auth, {
          agentConfigurationId: agent.sId,
          editorIds: usersToRemove.map((u) => u.id),
        });

      if (triggersToDisable.isErr()) {
        return new Err(normalizeAsInternalDustError(triggersToDisable.error));
      }
      for (const trigger of triggersToDisable.value) {
        const disableResult = await trigger.disable(auth);
        if (disableResult.isErr()) {
          logger.error(
            {
              workspaceId: auth.getNonNullableWorkspace().sId,
              agentConfigurationId: agent.sId,
              triggerId: trigger.sId,
              error: disableResult.error,
            },
            `Failed to disable trigger ${trigger.sId} when removing editor from agent ${agent.sId}`
          );
        }
      }
    }

    return new Ok(undefined);
  }

  private static async canPublishAgent(auth: Authenticator): Promise<{
    canPublish: boolean;
    message: string | null;
  }> {
    const canPublish = await auth.hasWorkspacePermission("publish", "agent");
    if (canPublish) {
      return { canPublish: true, message: null };
    }
    return {
      canPublish: false,
      message: "You don't have permission to publish agents.",
    };
  }

  // Does changing an agent's scope publish or unpublish it? Both require the workspace "publish
  // agents" permission. Publishing means an active agent becomes visible; unpublishing means an
  // active visible agent becomes hidden. A pure edit, or any change on a non-active
  // (draft/pending/archived) agent, needs no publish permission.
  private static needsPublishPermission({
    currentScope,
    newScope,
    isActive,
  }: {
    currentScope: AgentConfigurationScope;
    newScope: AgentConfigurationScope;
    isActive: boolean;
  }): boolean {
    if (!isActive) {
      return false;
    }
    const publishes = currentScope !== "visible" && newScope === "visible";
    const unpublishes = currentScope === "visible" && newScope === "hidden";
    return publishes || unpublishes;
  }

  static async updateAgentConfigurationsScope(
    auth: Authenticator,
    agentIds: string[],
    scope: Exclude<AgentConfigurationScope, "global">
  ): Promise<Result<void, Error>> {
    if (agentIds.length === 0) {
      return new Ok(undefined);
    }

    // Admins may publish or unpublish any agent of the workspace, including the ones built on
    // spaces they cannot read (the manage agents page lists those behind "Show hidden agents").
    // Changing the scope touches nothing the spaces protect.
    const agentConfigs = await AgentResource.getAgentConfigurations(auth, {
      agentIds,
      variant: "light",
      dangerouslySkipPermissionFiltering: auth.isAdmin(),
    });

    const archivedAgentNames = agentConfigs
      .filter((agent) => agent.status === "archived")
      .map((agent) => agent.name);
    if (archivedAgentNames.length > 0) {
      return new Err(
        new Error(
          `Archived agents cannot be updated: ${archivedAgentNames.join(", ")}. Restore them first.`
        )
      );
    }

    const editableAgents = agentConfigs.filter(
      (a) => a.canEdit || auth.isAdmin()
    );
    if (editableAgents.length === 0) {
      return new Ok(undefined);
    }

    const batchNeedsPublishPermission = editableAgents.some((a) =>
      AgentResource.needsPublishPermission({
        currentScope: a.scope,
        newScope: scope,
        isActive: a.status === "active",
      })
    );
    if (batchNeedsPublishPermission) {
      const { canPublish, message } = await AgentResource.canPublishAgent(auth);
      if (!canPublish) {
        return new Err(
          new Error(message ?? "You don't have permission to publish agents.")
        );
      }
    }

    // Snapshot previous scopes before the bulk UPDATE so downstream logic doesn't depend on
    // the in-memory agent objects being untouched by the static Sequelize update.
    const previousScopeByAgentId = new Map(
      editableAgents.map((a) => [a.sId, a.scope])
    );

    await AgentConfigurationModel.update(
      { scope },
      {
        where: {
          id: { [Op.in]: editableAgents.map((a) => a.id) },
          workspaceId: auth.getNonNullableWorkspace().id,
        },
      }
    );

    await AgentResource.launchSearchIndexation(
      auth,
      editableAgents.map((agent) => agent.sId)
    );

    for (const agentConfig of editableAgents) {
      void emitAuditLogEvent({
        auth,
        action: "agent.scope_changed",
        targets: [
          buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
          buildAuditLogTarget("agent", agentConfig),
        ],
        context: getAuditLogContext(auth),
        metadata: {
          agent_name: agentConfig.name,
          previous_scope:
            previousScopeByAgentId.get(agentConfig.sId) ?? agentConfig.scope,
          new_scope: scope,
        },
      });
    }

    // When scope changes from visible to hidden, disable triggers for non-editors.
    // Non-editors will no longer have access to the hidden agent.
    if (scope === "hidden") {
      const transitioningAgents = editableAgents.filter(
        (a) => previousScopeByAgentId.get(a.sId) === "visible"
      );
      if (transitioningAgents.length > 0) {
        await AgentResource.disableTriggersForNonEditors(
          auth,
          transitioningAgents
        );
      }
    }

    return new Ok(undefined);
  }

  private static async disableTriggersForNonEditors(
    auth: Authenticator,
    agents: LightAgentConfigurationType[]
  ): Promise<void> {
    const triggers = await TriggerResource.listByAgentConfigurationIds(
      auth,
      agents.map((a) => a.sId)
    );
    if (triggers.length === 0) {
      return;
    }

    const editorGroupsRes = await GroupResource.findEditorGroupsForAgents(
      auth,
      agents
    );
    const editorGroupsByAgentId = editorGroupsRes.isOk()
      ? editorGroupsRes.value
      : {};

    // Fetch members once per unique editor group.
    const editorModelIdsByGroupModelId = new Map<ModelId, Set<ModelId>>();
    for (const group of Object.values(editorGroupsByAgentId)) {
      if (editorModelIdsByGroupModelId.has(group.id)) {
        continue;
      }
      const members = await group.getActiveMembers(auth);
      editorModelIdsByGroupModelId.set(
        group.id,
        new Set(members.map((m) => m.id))
      );
    }

    const triggersToDisable = triggers.filter((trigger) => {
      const group = editorGroupsByAgentId[trigger.agentConfigurationId];
      const editorModelIds = group
        ? editorModelIdsByGroupModelId.get(group.id)
        : null;
      return !editorModelIds || !editorModelIds.has(trigger.editor);
    });

    if (triggersToDisable.length === 0) {
      return;
    }

    const res = await TriggerResource.disableMany(auth, triggersToDisable);
    if (res.isErr()) {
      logger.error(
        {
          workspaceId: auth.getNonNullableWorkspace().sId,
          error: res.error,
        },
        "Failed to disable triggers when changing agent scope to hidden"
      );
    }
  }

  static async filterAgentsByRequestedSpaces(
    auth: Authenticator,
    agents: AgentConfigurationModel[]
  ) {
    const uniqSpaceIds = Array.from(
      new Set(agents.flatMap((agent) => agent.requestedSpaceIds))
    );

    const spaces = await SpaceResource.fetchByModelIds(auth, uniqSpaceIds);
    const spaceById = new Map(spaces.map((s) => [s.id, s]));

    // Keep only agents whose every requested space is readable. A missing/deleted space is treated
    // as not readable (see `canReadRequestedSpaces`), so agents referencing one are dropped here too —
    // when a space is deleted its mcp actions are removed and `requestedSpaceIds` updated.
    return agents.filter((agent) =>
      canReadRequestedSpaces(auth, spaceById, agent.requestedSpaceIds)
    );
  }

  /**
   * Create Or Upgrade Agent Configuration. If an agentConfigurationId is
   * provided, a new version of the agent configuration with that same
   * agentConfigurationId is created. Otherwise a brand-new agent configuration
   * is created. In both cases the new agent configuration is returned.
   */
  static async createOrUpgradeAgentConfiguration({
    auth,
    assistant,
    agentConfigurationId,
    authorId,
    dangerouslySkipPermissionFiltering,
  }: {
    auth: Authenticator;
    assistant: PostOrPatchAgentConfigurationRequestBody["assistant"];
    agentConfigurationId?: string;
    authorId?: ModelId;
    // Keeps the requested spaces and the skills of an agent being re-saved even when the caller
    // cannot read them. Only for callers that re-save an existing agent as-is (admin batch model
    // updates): without it those spaces are rejected and those skills silently dropped, which would
    // unrestrict the agent and strip its skills. It grants no access to what the spaces protect.
    dangerouslySkipPermissionFiltering?: boolean;
  }): Promise<Result<AgentConfigurationType, Error>> {
    const skillsOnlyViews = await MCPServerViewResource.fetchByIds(
      auth,
      assistant.actions.map((action) => action.mcpServerViewId),
      { isRestrictedToSkills: true }
    );
    const skillsOnlyViewIds = new Set(skillsOnlyViews.map((view) => view.sId));
    const actions = assistant.actions.filter(
      (action) => !skillsOnlyViewIds.has(action.mcpServerViewId)
    );

    // Tools mode:
    // Enforce that every action has a name and a description and that every name is unique.
    if (actions.length > 1) {
      const actionsWithoutName = actions.filter((action) => !action.name);
      if (actionsWithoutName.length) {
        return new Err(
          Error(
            `Every action must have a name. Missing names for: ${actionsWithoutName
              .map((action) => action.type)
              .join(", ")}`
          )
        );
      }
      const actionNames = new Set<string>();
      for (const action of actions) {
        if (!action.name) {
          // To please the type system.
          throw new Error(`unreachable: action.name is required.`);
        }
        if (actionNames.has(action.name)) {
          return new Err(new Error(`Duplicate action name: ${action.name}`));
        }
        actionNames.add(action.name);
      }
      const actionsWithoutDesc = actions.filter(
        (action) => !action.description
      );
      if (actionsWithoutDesc.length) {
        return new Err(
          Error(
            `Every action must have a description. Missing descriptions for: ${actionsWithoutDesc
              .map((action) => action.type)
              .join(", ")}`
          )
        );
      }
    }

    const editors = (
      await UserResource.fetchByIds(assistant.editors.map((e) => e.sId))
    ).map((e) => e.toJSON());

    let skills: SkillResource[] = [];
    if (assistant.skills && assistant.skills.length > 0) {
      skills = await SkillResource.fetchByIds(
        auth,
        assistant.skills.map((s) => s.sId),
        {
          permissionFiltering: dangerouslySkipPermissionFiltering
            ? "dangerously_skip"
            : "strict",
        }
      );
    }

    const requirements =
      await getAgentConfigurationRequirementsFromCapabilities(auth, {
        actions,
        skills,
      });

    let allRequestedSpaceIds = requirements.requestedSpaceIds;

    // Collect additional requestedSpaceIds
    if (
      assistant.additionalRequestedSpaceIds &&
      assistant.additionalRequestedSpaceIds.length > 0
    ) {
      const additionalSpaces = await SpaceResource.fetchByIds(
        auth,
        assistant.additionalRequestedSpaceIds
      );

      // Validate that all requested spaces were found and user can read them
      if (!dangerouslySkipPermissionFiltering) {
        const readableSpaceIds = new Set(
          additionalSpaces
            .filter((space) => auth.can("read", space))
            .map((s) => s.sId)
        );
        const inaccessibleSpaces = assistant.additionalRequestedSpaceIds.filter(
          (sId) => !readableSpaceIds.has(sId)
        );
        if (inaccessibleSpaces.length > 0) {
          return new Err(
            new Error(
              `User does not have access to the following spaces: ${inaccessibleSpaces.join(", ")}`
            )
          );
        }
      }

      const additionalSpaceModelIds = removeNulls(
        additionalSpaces.map((s) => getResourceIdFromSId(s.sId))
      );

      allRequestedSpaceIds = uniq(
        allRequestedSpaceIds.concat(additionalSpaceModelIds)
      );
    }

    const resolvedAuthorId = authorId ?? auth.user()?.id;
    if (!resolvedAuthorId) {
      return new Err(
        new Error("An author must be provided when no user is authenticated.")
      );
    }

    const modelConfig = getSupportedModelConfig(assistant.model);
    if (!modelConfig) {
      return new Err(
        new Error(
          `Unsupported model "${assistant.model.modelId}" for provider ` +
            `"${assistant.model.providerId}".`
        )
      );
    }

    const accessError = await getModelTierAccessErrorForAgentConfiguration(
      auth,
      {
        agentName: assistant.name,
        model: modelConfig,
        reasoningEffort: assistant.model.reasoningEffort,
      }
    );
    if (accessError) {
      return new Err(new Error(accessError.message));
    }

    const appIds = actions.flatMap((action) =>
      action.dustAppConfiguration ? [action.dustAppConfiguration.appId] : []
    );
    const apps =
      appIds.length > 0 ? await AppResource.fetchByIds(auth, appIds) : [];
    const appById = new Map(apps.map((app) => [app.sId, app]));
    if (appIds.some((appId) => !appById.has(appId))) {
      return new Err(new Error("Dust app not found"));
    }

    const agentConfigurationRes = await AgentResource.createAgentConfiguration(
      auth,
      {
        name: assistant.name,
        description: assistant.description,
        instructions: assistant.instructions ?? null,
        instructionsHtml: assistant.instructionsHtml ?? null,
        pictureUrl: assistant.pictureUrl,
        status: assistant.status,
        scope: assistant.scope,
        model: assistant.model,
        agentConfigurationId,
        templateId: assistant.templateId ?? null,
        requestedSpaceIds: allRequestedSpaceIds,
        tags: assistant.tags,
        editors,
        authorId: resolvedAuthorId,
        actions: actions.map((action) => ({
          ...action,
          // Builder nulls represent unset optional configuration values.
          additionalConfiguration: Object.fromEntries(
            Object.entries(action.additionalConfiguration).filter(
              (entry): entry is [string, Exclude<(typeof entry)[1], null>] =>
                entry[1] !== null
            )
          ),
          description: action.description ?? DEFAULT_MCP_ACTION_DESCRIPTION,
          dustAppConfiguration: action.dustAppConfiguration
            ? (appById
                .get(action.dustAppConfiguration.appId)
                ?.toAgentActionJSON(auth) ?? null)
            : null,
          dataSources:
            action.dataSources?.map((dataSource) => ({
              ...dataSource,
              filter: {
                ...dataSource.filter,
                tags: dataSource.filter.tags ?? null,
              },
            })) ?? null,
        })),
        skills,
      }
    );

    if (agentConfigurationRes.isErr()) {
      return agentConfigurationRes;
    }

    const agentConfiguration = agentConfigurationRes.value;

    // We are not tracking draft agents
    if (agentConfigurationRes.value.status === "active") {
      void ServerSideTracking.trackAssistantCreated({
        user: auth.user() ?? undefined,
        workspace: auth.workspace() ?? undefined,
        assistant: agentConfiguration,
      });
    }

    return new Ok(agentConfiguration);
  }
}
