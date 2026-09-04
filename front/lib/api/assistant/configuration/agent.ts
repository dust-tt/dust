import {
  enrichAgentConfigurations,
  getModelForAgentConfiguration,
  isSelfHostedImageWithValidContentType,
  redactPrivateAgentConfigurationFields,
} from "@app/lib/api/assistant/configuration/helpers";
import { getGlobalAgents } from "@app/lib/api/assistant/global_agents/global_agents";
import { agentConfigurationWasUpdatedBy } from "@app/lib/api/assistant/recent_authors";
import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { getModelsForAuth } from "@app/lib/model_tiers/enabled_models";
import { AgentDataSourceConfigurationModel } from "@app/lib/models/agent/actions/data_sources";
import {
  AgentChildAgentConfigurationModel,
  AgentMCPServerConfigurationModel,
} from "@app/lib/models/agent/actions/mcp";
import { AgentTablesQueryConfigurationTableModel } from "@app/lib/models/agent/actions/tables_query";
import {
  AgentConfigurationModel,
  AgentModel,
  AgentUserRelationModel,
} from "@app/lib/models/agent/agent";
import { AgentSkillModel } from "@app/lib/models/agent/agent_skill";
import { AgentSuggestionModel } from "@app/lib/models/agent/agent_suggestion";
import { GroupAgentModel } from "@app/lib/models/agent/group_agent";
import { TagAgentModel } from "@app/lib/models/agent/tag_agent";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { AgentUserRelationResource } from "@app/lib/resources/agent_user_relation_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { canReadRequestedSpaces } from "@app/lib/resources/permission_utils";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { GroupMembershipModel } from "@app/lib/resources/storage/models/group_memberships";
import { GroupModel } from "@app/lib/resources/storage/models/groups";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { TagResource } from "@app/lib/resources/tags_resource";
import { TemplateResource } from "@app/lib/resources/template_resource";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { WakeUpResource } from "@app/lib/resources/wakeup_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { withTransaction } from "@app/lib/utils/sql_utils";
import logger from "@app/logger/logger";
import { tracer } from "@app/logger/tracer";
import type {
  AgentConfigurationScope,
  AgentConfigurationType,
  AgentFetchVariant,
  AgentModelConfigurationType,
  AgentReinforcementMode,
  AgentStatus,
  GlobalAgentContext,
  LightAgentConfigurationType,
} from "@app/types/assistant/agent";
import { MAX_STEPS_USE_PER_RUN_LIMIT } from "@app/types/assistant/agent";
import {
  GLOBAL_AGENTS_SID,
  isGlobalAgentId,
} from "@app/types/assistant/assistant";
import { validateResponseFormat } from "@app/types/assistant/models/utils";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeAsInternalDustError } from "@app/types/shared/utils/error_utils";
import { removeNulls } from "@app/types/shared/utils/general";
import type { TagType } from "@app/types/tag";
import type { UserType } from "@app/types/user";
import { isAdmin } from "@app/types/user";
import assert from "assert";
import type { Transaction } from "sequelize";
import {
  Op,
  QueryTypes,
  UniqueConstraintError,
  ValidationError,
} from "sequelize";

// Placeholder constants for pending agents
const PENDING_AGENT_PLACEHOLDER_NAME = "__PENDING__";
const PENDING_AGENT_PLACEHOLDER_DESCRIPTION = "";
const PENDING_AGENT_PLACEHOLDER_PICTURE_URL =
  "https://dust.tt/static/systemavatar/dust_avatar_full.png";

/**
 * Creates a pending agent configuration.
 * Pending agents are placeholders created when the agent builder is opened for a new agent,
 * before it is saved for the first time. This allows capturing the sId early.
 */
export async function createPendingAgentConfiguration(
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
    await AgentResource.fromAgentConfigurationModel(agent).grantEditors(auth, {
      editors: [user.toJSON()],
      transaction: t,
    });
    await auth.refresh({ transaction: t });
  });

  return new Ok({ sId });
}

export async function getAgentConfigurationsWithVersion<
  V extends AgentFetchVariant,
>(
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
    : await filterAgentsByRequestedSpaces(auth, workspaceAgentModels);
  const workspaceAgents = await enrichAgentConfigurations(
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
export async function listsAgentConfigurationVersions<
  V extends AgentFetchVariant,
>(
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
    const allowedAgentModels = await filterAgentsByRequestedSpaces(
      auth,
      agentModels
    );
    agents = await enrichAgentConfigurations(auth, allowedAgentModels, {
      variant,
    });
  }

  return agents as V extends "full"
    ? AgentConfigurationType[]
    : LightAgentConfigurationType[];
}

async function fetchLatestWorkspaceAgentModels(
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
export async function fetchFirstVersionCreatedAtByAgentId(
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
export async function getAgentConfigurations<V extends AgentFetchVariant>(
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
      const agentModels = await fetchLatestWorkspaceAgentModels(
        auth,
        workspaceAgentIds
      );

      const allowedAgentModels = dangerouslySkipPermissionFiltering
        ? agentModels
        : await filterAgentsByRequestedSpaces(auth, agentModels);
      workspaceAgents = await enrichAgentConfigurations(
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
export async function getAgentConfiguration<V extends AgentFetchVariant>(
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
      const [agent] = await getAgentConfigurationsWithVersion(
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
    const [agent] = await getAgentConfigurations(auth, {
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
export async function getAgentConfigurationForDetails(
  auth: Authenticator,
  { agentId }: { agentId: string }
): Promise<AgentConfigurationType | null> {
  const agent = await getAgentConfiguration(auth, {
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
    (await getAgentConfiguration(auth, {
      agentId,
      variant: "light",
      dangerouslySkipPermissionFiltering: true,
    }));

  return restrictedAgent
    ? redactPrivateAgentConfigurationFields(restrictedAgent)
    : null;
}

type AgentLabel = {
  sId: string;
  authorModelId: ModelId;
  name: string;
  pictureUrl: string | null;
  model: AgentModelConfigurationType;
  scope: Exclude<AgentConfigurationScope, "global">;
};

export async function getAgentLabelsByIds(
  auth: Authenticator,
  agentIds: string[]
): Promise<AgentLabel[]> {
  if (!auth.isManager()) {
    return [];
  }

  const workspaceAgentIds = agentIds.filter((id) => !isGlobalAgentId(id));
  const agentModels = await fetchLatestWorkspaceAgentModels(
    auth,
    workspaceAgentIds
  );

  return agentModels.map((agent) => ({
    sId: agent.sId,
    name: agent.name,
    authorModelId: agent.authorId,
    pictureUrl: agent.pictureUrl,
    model: getModelForAgentConfiguration(agent),
    scope: agent.scope,
  }));
}

/**
 * Search agent configurations by name.
 */
export async function searchAgentConfigurationsByName(
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
  const agents = await getAgentConfigurations(auth, {
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
export async function resolveAgentConfigurationIdByName(
  auth: Authenticator,
  agentName: string
): Promise<string | null> {
  const normalizedAgentName = agentName.trim().toLowerCase();
  if (normalizedAgentName === "dust" || normalizedAgentName === "dust agent") {
    return GLOBAL_AGENTS_SID.DUST;
  }

  const workspaceMatches = await searchAgentConfigurationsByName(
    auth,
    agentName
  );
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

export async function createAgentConfiguration(
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
  },
  transaction?: Transaction
): Promise<Result<LightAgentConfigurationType, Error>> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Unexpected `auth` without `workspace`.");
  }

  const isValidPictureUrl =
    await isSelfHostedImageWithValidContentType(pictureUrl);
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

  let version = 0;

  let userFavorite = false;

  // For hidden agents, track previous editors to disable triggers when editors are removed.
  let previousEditorIds: Set<ModelId> = new Set();
  // The scope the agent has before this write. A new agent starts hidden, so saving it
  // visible counts as publishing.
  let currentScope: AgentConfigurationScope = "hidden";
  if (agentConfigurationId) {
    const existingAgent = await getAgentConfiguration(auth, {
      agentId: agentConfigurationId,
      variant: "light",
    });
    if (existingAgent) {
      currentScope = existingAgent.scope;
      if (scope === "hidden") {
        const editorGroupRes = await GroupResource.findEditorGroupForAgent(
          auth,
          existingAgent
        );
        if (editorGroupRes.isOk()) {
          const members = await editorGroupRes.value.getActiveMembers(auth);
          previousEditorIds = new Set(members.map((m) => m.id));
        }
      }
    }
  }

  if (
    needsPublishPermission({
      currentScope,
      newScope: scope,
      isActive: status === "active",
    })
  ) {
    const { canPublish, message } = await canPublishAgent(auth);
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
        const canCreate = await auth.hasWorkspacePermission("create", "agent");
        if (!canCreate) {
          throw new Error("Creating agents is restricted.");
        }
      }

      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      const sId = agentConfigurationId || generateRandomModelSId();
      let agentModelId = existingAgent?.agentId;
      if (!agentModelId) {
        const [agentIdentity] = await AgentModel.findOrCreate({
          where: { sId, workspaceId: owner.id },
          defaults: { sId, workspaceId: owner.id },
          transaction: t,
        });
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
        ? await TagResource.listForAgent(auth, existingAgent.id)
        : [];
      const existingReservedTags = existingTags
        .filter((t) => t.kind === "protected")
        .map((t) => t.sId);
      if (
        !canManageProtectedTags &&
        !existingReservedTags.every((reservedTagId) =>
          tags.some((tag) => tag.sId === reservedTagId)
        )
      ) {
        throw new Error("Cannot remove reserved tag from agent");
      }

      if (status === "active") {
        const tagResources = await TagResource.fetchByIds(
          auth,
          tags.map((tag) => tag.sId)
        );
        const tagResourceById = new Map(
          tagResources.map((tagResource) => [tagResource.sId, tagResource])
        );

        for (const tag of tags) {
          const tagResource = tagResourceById.get(tag.sId);
          if (tagResource) {
            if (
              !canManageProtectedTags &&
              tagResource.kind === "protected" &&
              !existingReservedTags.includes(tagResource.sId)
            ) {
              throw new Error("Cannot add reserved tag to agent");
            }
            await TagAgentModel.create(
              {
                workspaceId: owner.id,
                tagId: tagResource.id,
                agentConfigurationId: agentConfigurationInstance.id,
              },
              { transaction: t }
            );
          }
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
          await auth.refresh({ transaction: t });
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
        }

        await AgentResource.fromAgentConfigurationModel(
          agentConfigurationInstance
        ).grantEditors(auth, { editors, transaction: t });
      }

      return agentConfigurationInstance;
    };

    const agent = await withTransaction(performCreation, transaction);

    /*
     * Final rendering.
     */
    const agentConfiguration: LightAgentConfigurationType = {
      id: agent.id,
      sId: agent.sId,
      versionCreatedAt: agent.createdAt.toISOString(),
      version: agent.version,
      versionAuthorId: agent.authorId,
      scope: agent.scope,
      name: agent.name,
      description: agent.description,
      instructions: agent.instructions,
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

    await agentConfigurationWasUpdatedBy({
      agent: agentConfiguration,
      auth,
    });

    // Disable triggers for editors who were removed from a hidden agent.
    if (previousEditorIds.size > 0 && scope === "hidden") {
      const newEditorIds = new Set(editors.map((e) => e.id));
      const removedEditorIds = Array.from(previousEditorIds).filter(
        (id) => !newEditorIds.has(id)
      );

      if (removedEditorIds.length > 0) {
        const triggersToDisableRes =
          await TriggerResource.listByAgentConfigurationIdAndEditors(auth, {
            agentConfigurationId: agent.sId,
            editorIds: removedEditorIds,
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
async function cancelWakeUpsForAgent(
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

type ArchiveAgentConfigurationOptions = {
  dangerouslySkipPermissionFiltering?: boolean;
};

export async function archiveAgentConfiguration(
  auth: Authenticator,
  agentConfigurationId: string,
  { dangerouslySkipPermissionFiltering }: ArchiveAgentConfigurationOptions = {}
): Promise<boolean> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Unexpected `auth` without `workspace`.");
  }

  const agentConfig = await getAgentConfiguration(auth, {
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

  await cancelWakeUpsForAgent(auth, agentConfigurationId);

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

export async function restoreAgentConfiguration(
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
    const { canPublish, message } = await canPublishAgent(auth);
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
      },
    }
  );

  // Re-enable triggers.
  if (updated[0] > 0) {
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
export async function cleanupAgentScopedResourcesForHardDeletion(
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

async function deleteAgentIdentityIfUnused(
  workspaceId: number,
  sId: string,
  transaction: Transaction
): Promise<void> {
  const remainingConfiguration = await AgentConfigurationModel.findOne({
    where: { sId, workspaceId },
    attributes: ["id"],
    transaction,
  });
  if (remainingConfiguration) {
    return;
  }

  await AgentModel.destroy({
    where: { sId, workspaceId },
    transaction,
  });
}

// Should only be called when we need to clean up the agent configuration
// right after creating it due to an error.
export async function unsafeHardDeleteAgentConfiguration(
  auth: Authenticator,
  agentConfiguration: LightAgentConfigurationType
): Promise<void> {
  const workspaceId = auth.getNonNullableWorkspace().id;

  await withTransaction(async (t) => {
    // Clean up MCP server configurations and their children first
    const mcpConfigs = await AgentMCPServerConfigurationModel.findAll({
      where: {
        agentConfigurationId: agentConfiguration.id,
        workspaceId,
      },
      attributes: ["id"],
      transaction: t,
    });
    if (mcpConfigs.length) {
      const mcpIds = mcpConfigs.map((c) => c.id);

      await AgentDataSourceConfigurationModel.destroy({
        where: {
          workspaceId,
          mcpServerConfigurationId: { [Op.in]: mcpIds },
        },
        transaction: t,
      });

      await AgentTablesQueryConfigurationTableModel.destroy({
        where: {
          workspaceId,
          mcpServerConfigurationId: { [Op.in]: mcpIds },
        },
        transaction: t,
      });

      await AgentChildAgentConfigurationModel.destroy({
        where: {
          workspaceId,
          mcpServerConfigurationId: { [Op.in]: mcpIds },
        },
        transaction: t,
      });

      await AgentMCPServerConfigurationModel.destroy({
        where: {
          workspaceId,
          id: { [Op.in]: mcpIds },
        },
        transaction: t,
      });
    }

    await TagAgentModel.destroy({
      where: {
        agentConfigurationId: agentConfiguration.id,
        workspaceId,
      },
      transaction: t,
    });

    await GroupAgentModel.destroy({
      where: {
        agentConfigurationId: agentConfiguration.id,
        workspaceId,
      },
      transaction: t,
    });

    await AgentSkillModel.destroy({
      where: {
        agentConfigurationId: agentConfiguration.id,
        workspaceId,
      },
      transaction: t,
    });

    await AgentConfigurationModel.destroy({
      where: {
        id: agentConfiguration.id,
        workspaceId,
      },
      transaction: t,
    });

    await deleteAgentIdentityIfUnused(workspaceId, agentConfiguration.sId, t);
  });
}

/**
 * Batch-deletes pending agent configurations and their editor groups.
 */
export async function batchHardDeletePendingAgentConfigurations(
  agents: AgentConfigurationModel[],
  workspaceId: number
) {
  const agentIds = agents.map((a) => a.id);

  // Find all editor group IDs for this batch.
  const groupAgents = await GroupAgentModel.findAll({
    where: { agentConfigurationId: agentIds, workspaceId },
  });
  const groupIds = groupAgents.map((ga) => ga.groupId);

  await withTransaction(async (t) => {
    if (groupIds.length > 0) {
      await GroupMembershipModel.destroy({
        where: { groupId: groupIds, workspaceId },
        transaction: t,
      });

      await GroupAgentModel.destroy({
        where: { groupId: groupIds, workspaceId },
        transaction: t,
      });

      await GroupModel.destroy({
        where: { id: groupIds, workspaceId },
        transaction: t,
      });
    }

    // Delete agent suggestions before agents (FK constraint)
    await AgentSuggestionModel.destroy({
      where: { agentConfigurationId: agentIds, workspaceId },
      transaction: t,
    });

    await AgentUserRelationResource.deleteForAgents(
      agents.map((a) => a.sId),
      { workspaceId, transaction: t }
    );

    await AgentConfigurationModel.destroy({
      where: { id: agentIds, workspaceId },
      transaction: t,
    });

    for (const sId of new Set(agents.map((agent) => agent.sId))) {
      await deleteAgentIdentityIfUnused(workspaceId, sId, t);
    }
  });
}

/**
 * Updates the permissions (editors) for an agent configuration.
 */
export async function updateAgentPermissions(
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

  try {
    const transactionResult = await withTransaction(async (t) => {
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

        const agentResource = await AgentResource.fetchByAgentConfiguration(
          auth,
          agent,
          { transaction: t }
        );
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
      }
      return new Ok(undefined);
    });

    if (transactionResult.isErr()) {
      return transactionResult;
    }

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
  } catch (error) {
    // Catch errors thrown from within the transaction
    return new Err(normalizeAsInternalDustError(error));
  }
}

async function canPublishAgent(auth: Authenticator): Promise<{
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
function needsPublishPermission({
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

export async function updateAgentConfigurationsScope(
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
  const agentConfigs = await getAgentConfigurations(auth, {
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
    needsPublishPermission({
      currentScope: a.scope,
      newScope: scope,
      isActive: a.status === "active",
    })
  );
  if (batchNeedsPublishPermission) {
    const { canPublish, message } = await canPublishAgent(auth);
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
      },
    }
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
      await disableTriggersForNonEditors(auth, transitioningAgents);
    }
  }

  return new Ok(undefined);
}

async function disableTriggersForNonEditors(
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

export async function filterAgentsByRequestedSpaces(
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
