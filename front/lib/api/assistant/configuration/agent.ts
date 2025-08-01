import assert from "assert";
import { tracer } from "dd-trace";
import type { Transaction } from "sequelize";
import {
  Op,
  Sequelize,
  UniqueConstraintError,
  ValidationError,
} from "sequelize";

import {
  enrichAgentConfigurations,
  isSelfHostedImageWithValidContentType,
} from "@app/lib/api/assistant/configuration/helpers";
import { getGlobalAgents } from "@app/lib/api/assistant/global_agents";
import { agentConfigurationWasUpdatedBy } from "@app/lib/api/assistant/recent_authors";
import { Authenticator } from "@app/lib/auth";
import type { DustError } from "@app/lib/error";
import {
  AgentConfiguration,
  AgentUserRelation,
} from "@app/lib/models/assistant/agent";
import { TagAgentModel } from "@app/lib/models/assistant/tag_agent";
import { GroupResource } from "@app/lib/resources/group_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import { TagResource } from "@app/lib/resources/tags_resource";
import { TemplateResource } from "@app/lib/resources/template_resource";
import { normalizeArrays } from "@app/lib/utils";
import logger from "@app/logger/logger";
import type {
  AgentConfigurationScope,
  AgentConfigurationType,
  AgentFetchVariant,
  AgentModelConfigurationType,
  AgentStatus,
  LightAgentConfigurationType,
  Result,
  UserType,
} from "@app/types";
import {
  Err,
  isAdmin,
  isBuilder,
  MAX_STEPS_USE_PER_RUN_LIMIT,
  normalizeAsInternalDustError,
  Ok,
} from "@app/types";
import { isGlobalAgentId, removeNulls } from "@app/types";
import type { TagType } from "@app/types/tag";

/**
 * Get one specific version of a single agent
 */
async function getAgentConfigurationWithVersion<V extends AgentFetchVariant>(
  auth: Authenticator,
  {
    agentId,
    agentVersion,
    variant,
  }: { agentId: string; agentVersion: number; variant: V }
): Promise<
  | (V extends "light" ? LightAgentConfigurationType : AgentConfigurationType)
  | null
> {
  const owner = auth.workspace();
  if (!owner || !auth.isUser()) {
    throw new Error("Unexpected `auth` without `workspace`.");
  }

  assert(!isGlobalAgentId(agentId), "Global agents are not versioned.");

  const workspaceAgents = await AgentConfiguration.findAll({
    where: {
      // Relies on the indexes (workspaceId), (sId, version).
      workspaceId: owner.id,
      sId: agentId,
      version: agentVersion,
    },
    order: [["version", "DESC"]],
  });

  const agents = await enrichAgentConfigurations(auth, workspaceAgents, {
    variant,
  });

  const allowedAgents = agents.filter((a) =>
    auth.canRead(
      Authenticator.createResourcePermissionsFromGroupIds(a.requestedGroupIds)
    )
  );

  return (
    (allowedAgents[0] as V extends "light"
      ? LightAgentConfigurationType
      : AgentConfigurationType) || null
  );
}

// Main entry points for fetching agents.

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

  let allAgents: AgentConfigurationType[];
  if (isGlobalAgentId(agentId)) {
    allAgents = await getGlobalAgents(auth, [agentId], variant);
  } else {
    const workspaceAgents = await AgentConfiguration.findAll({
      where: {
        workspaceId: owner.id,
        sId: agentId,
      },
      order: [["version", "DESC"]],
    });
    allAgents = await enrichAgentConfigurations(auth, workspaceAgents, {
      variant,
    });
  }

  // Filter by permissions
  const allowedAgents = allAgents.filter((a) =>
    auth.canRead(
      Authenticator.createResourcePermissionsFromGroupIds(a.requestedGroupIds)
    )
  );

  return allowedAgents as V extends "full"
    ? AgentConfigurationType[]
    : LightAgentConfigurationType[];
}

/**
 * Get the latest versions of multiple agents.
 */
export async function getAgentConfigurations<V extends AgentFetchVariant>(
  auth: Authenticator,
  {
    agentIds,
    variant,
  }: {
    agentIds: string[];
    variant: V;
  }
): Promise<
  V extends "full" ? AgentConfigurationType[] : LightAgentConfigurationType[]
> {
  return tracer.trace("getAgentConfigurations", async () => {
    const owner = auth.workspace();
    if (!owner || !auth.isUser()) {
      throw new Error("Unexpected `auth` without `workspace`.");
    }

    const globalAgentIds = agentIds.filter(isGlobalAgentId);

    let globalAgents: AgentConfigurationType[] = [];
    if (globalAgentIds.length > 0) {
      globalAgents = await getGlobalAgents(auth, globalAgentIds, variant);
    }

    const workspaceAgentIds = agentIds.filter((id) => !isGlobalAgentId(id));

    let workspaceAgents: AgentConfigurationType[] = [];
    if (workspaceAgentIds.length > 0) {
      const latestVersions = (await AgentConfiguration.findAll({
        attributes: [
          "sId",
          [Sequelize.fn("MAX", Sequelize.col("version")), "max_version"],
        ],
        where: {
          workspaceId: owner.id,
          sId: workspaceAgentIds,
        },
        group: ["sId"],
        raw: true,
      })) as unknown as { sId: string; max_version: number }[];

      const workspaceAgentConfigurations = await AgentConfiguration.findAll({
        where: {
          workspaceId: owner.id,
          [Op.or]: latestVersions.map((v) => ({
            sId: v.sId,
            version: v.max_version,
          })),
        },
        order: [["version", "DESC"]],
      });
      workspaceAgents = await enrichAgentConfigurations(
        auth,
        workspaceAgentConfigurations,
        { variant }
      );
    }

    const allAgents = [...globalAgents, ...workspaceAgents];

    // Filter by permissions
    const allowedAgents = allAgents.filter((a) =>
      auth.canRead(
        Authenticator.createResourcePermissionsFromGroupIds(a.requestedGroupIds)
      )
    );

    return allowedAgents as V extends "full"
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
  }: { agentId: string; agentVersion?: number; variant: V }
): Promise<
  | (V extends "light" ? LightAgentConfigurationType : AgentConfigurationType)
  | null
> {
  return tracer.trace("getAgentConfiguration", async () => {
    if (agentVersion !== undefined) {
      return getAgentConfigurationWithVersion(auth, {
        agentId,
        agentVersion,
        variant,
      });
    }
    const [agent] = await getAgentConfigurations(auth, {
      agentIds: [agentId],
      variant,
    });
    return (
      (agent as V extends "light"
        ? LightAgentConfigurationType
        : AgentConfigurationType) || null
    );
  });
}

/**
 * Search agent configurations by name.
 */
export async function searchAgentConfigurationsByName(
  auth: Authenticator,
  name: string
): Promise<LightAgentConfigurationType[]> {
  const owner = auth.getNonNullableWorkspace();

  const agentConfigurations = await AgentConfiguration.findAll({
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

export async function createAgentConfiguration(
  auth: Authenticator,
  {
    name,
    description,
    instructions,
    visualizationEnabled,
    pictureUrl,
    status,
    scope,
    model,
    agentConfigurationId,
    templateId,
    requestedGroupIds,
    tags,
    editors,
  }: {
    name: string;
    description: string;
    instructions: string | null;
    visualizationEnabled: boolean;
    pictureUrl: string;
    status: AgentStatus;
    scope: Exclude<AgentConfigurationScope, "global">;
    model: AgentModelConfigurationType;
    agentConfigurationId?: string;
    templateId: string | null;
    requestedGroupIds: number[][];
    tags: TagType[];
    editors: UserType[];
  },
  transaction?: Transaction
): Promise<Result<LightAgentConfigurationType, Error>> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Unexpected `auth` without `workspace`.");
  }

  const user = auth.user();
  if (!user) {
    throw new Error("Unexpected `auth` without `user`.");
  }

  const isValidPictureUrl =
    await isSelfHostedImageWithValidContentType(pictureUrl);
  if (!isValidPictureUrl) {
    return new Err(new Error("Invalid picture url."));
  }

  let version = 0;

  let userFavorite = false;

  try {
    let template: TemplateResource | null = null;
    if (templateId) {
      template = await TemplateResource.fetchByExternalId(templateId);
    }
    const performCreation = async (
      t: Transaction
    ): Promise<AgentConfiguration> => {
      let existingAgent = null;
      if (agentConfigurationId) {
        const [agentConfiguration, userRelation] = await Promise.all([
          AgentConfiguration.findOne({
            where: {
              sId: agentConfigurationId,
              workspaceId: owner.id,
            },
            attributes: ["scope", "version", "id", "sId"],
            order: [["version", "DESC"]],
            transaction: t,
            limit: 1,
          }),
          AgentUserRelation.findOne({
            where: {
              workspaceId: owner.id,
              agentConfiguration: agentConfigurationId,
              userId: user.id,
            },
            transaction: t,
          }),
        ]);

        existingAgent = agentConfiguration;

        if (existingAgent) {
          // Bump the version of the agent.
          version = existingAgent.version + 1;
        }

        await AgentConfiguration.update(
          { status: "archived" },
          {
            where: {
              sId: agentConfigurationId,
              workspaceId: owner.id,
            },
            transaction: t,
          }
        );
        userFavorite = userRelation?.favorite ?? false;
      }

      const sId = agentConfigurationId || generateRandomModelSId();

      // Create Agent config.
      const agentConfigurationInstance = await AgentConfiguration.create(
        {
          sId,
          version,
          status,
          scope,
          name,
          description,
          instructions,
          providerId: model.providerId,
          modelId: model.modelId,
          temperature: model.temperature,
          reasoningEffort: model.reasoningEffort,
          maxStepsPerRun: MAX_STEPS_USE_PER_RUN_LIMIT,
          visualizationEnabled,
          pictureUrl,
          workspaceId: owner.id,
          authorId: user.id,
          templateId: template?.id,
          requestedGroupIds: normalizeArrays(requestedGroupIds),
          responseFormat: model.responseFormat,
        },
        {
          transaction: t,
        }
      );

      const existingTags = existingAgent
        ? await TagResource.listForAgent(auth, existingAgent.id)
        : [];
      const existingReservedTags = existingTags
        .filter((t) => t.kind === "protected")
        .map((t) => t.sId);
      if (
        !isBuilder(owner) &&
        !existingReservedTags.every((reservedTagId) =>
          tags.some((tag) => tag.sId === reservedTagId)
        )
      ) {
        throw new Error("Cannot remove reserved tag from agent");
      }

      if (status === "active") {
        for (const tag of tags) {
          const tagResource = await TagResource.fetchById(auth, tag.sId);
          if (tagResource) {
            if (
              !isBuilder(owner) &&
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
          editors.some((e) => e.sId === auth.user()?.sId) || isAdmin(owner),
          "Unexpected: current user must be in editor group or admin"
        );
        if (!existingAgent) {
          const group = await GroupResource.makeNewAgentEditorsGroup(
            auth,
            agentConfigurationInstance,
            { transaction: t }
          );
          await group.setMembers(auth, editors, { transaction: t });
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
          await group.setMembers(auth, editors, { transaction: t });
        }
      }

      return agentConfigurationInstance;
    };

    const agent = await (transaction
      ? performCreation(transaction)
      : frontSequelize.transaction(performCreation));

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
      visualizationEnabled: agent.visualizationEnabled ?? false,
      templateId: template?.sId ?? null,
      requestedGroupIds: agent.requestedGroupIds.map((groups) =>
        groups.map((id) =>
          GroupResource.modelIdToSId({ id, workspaceId: owner.id })
        )
      ),
      tags,
      canRead: true,
      canEdit: true,
    };

    await agentConfigurationWasUpdatedBy({
      agent: agentConfiguration,
      auth,
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
    throw error;
  }
}

export async function archiveAgentConfiguration(
  auth: Authenticator,
  agentConfigurationId: string
): Promise<boolean> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Unexpected `auth` without `workspace`.");
  }

  const updated = await AgentConfiguration.update(
    { status: "archived" },
    {
      where: {
        sId: agentConfigurationId,
        workspaceId: owner.id,
      },
    }
  );

  const affectedCount = updated[0];
  return affectedCount > 0;
}

export async function restoreAgentConfiguration(
  auth: Authenticator,
  agentConfigurationId: string
): Promise<boolean> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Unexpected `auth` without `workspace`.");
  }
  const latestConfig = await AgentConfiguration.findOne({
    where: {
      sId: agentConfigurationId,
      workspaceId: owner.id,
    },
    order: [["version", "DESC"]],
    limit: 1,
  });
  if (!latestConfig) {
    throw new Error("Could not find agent configuration");
  }
  if (latestConfig.status !== "archived") {
    throw new Error("Agent configuration is not archived");
  }
  const updated = await AgentConfiguration.update(
    { status: "active" },
    {
      where: {
        id: latestConfig.id,
      },
    }
  );

  const affectedCount = updated[0];
  return affectedCount > 0;
}

// Should only be called when we need to clean up the agent configuration
// right after creating it due to an error.
export async function unsafeHardDeleteAgentConfiguration(
  agentConfiguration: LightAgentConfigurationType
): Promise<void> {
  await AgentConfiguration.destroy({
    where: {
      id: agentConfiguration.id,
    },
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
    >
  >
> {
  const editorGroupRes = await GroupResource.findEditorGroupForAgent(
    auth,
    agent
  );
  if (editorGroupRes.isErr()) {
    return editorGroupRes;
  }

  // The canWrite check for agent_editors groups (allowing members and admins)
  // is implicitly handled by addMembers and removeMembers.
  try {
    return await frontSequelize.transaction(async (t) => {
      if (usersToAdd.length > 0) {
        const addRes = await editorGroupRes.value.addMembers(auth, usersToAdd, {
          transaction: t,
        });
        if (addRes.isErr()) {
          return addRes;
        }
      }

      if (usersToRemove.length > 0) {
        const removeRes = await editorGroupRes.value.removeMembers(
          auth,
          usersToRemove,
          {
            transaction: t,
          }
        );
        if (removeRes.isErr()) {
          return removeRes;
        }
      }
      return new Ok(undefined);
    });
  } catch (error) {
    // Catch errors thrown from within the transaction
    return new Err(normalizeAsInternalDustError(error));
  }
}

export async function updateAgentConfigurationScope(
  auth: Authenticator,
  agentConfigurationId: string,
  scope: Exclude<AgentConfigurationScope, "global">
) {
  const agent = await AgentConfiguration.findOne({
    where: {
      workspaceId: auth.getNonNullableWorkspace().id,
      sId: agentConfigurationId,
      status: "active",
    },
  });

  if (!agent) {
    return new Err(new Error(`Could not find agent ${agentConfigurationId}`));
  }

  agent.scope = scope;
  await agent.save();

  return new Ok(undefined);
}

export async function updateAgentRequestedGroupIds(
  auth: Authenticator,
  params: { agentId: string; newGroupIds: number[][] },
  options?: { transaction?: Transaction }
): Promise<Result<boolean, Error>> {
  const { agentId, newGroupIds } = params;

  const owner = auth.getNonNullableWorkspace();

  const updated = await AgentConfiguration.update(
    { requestedGroupIds: normalizeArrays(newGroupIds) },
    {
      where: {
        workspaceId: owner.id,
        sId: agentId,
      },
      transaction: options?.transaction,
    }
  );

  return new Ok(updated[0] > 0);
}
