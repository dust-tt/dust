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
  DEFAULT_WEBSEARCH_ACTION_DESCRIPTION,
  DEFAULT_WEBSEARCH_ACTION_NAME,
} from "@app/lib/actions/constants";
import type { ServerSideMCPServerConfigurationType } from "@app/lib/actions/mcp";
import { createAgentActionConfiguration } from "@app/lib/api/assistant/configuration/actions";
import {
  enrichAgentConfigurations,
  isSelfHostedImageWithValidContentType,
} from "@app/lib/api/assistant/configuration/helpers";
import type { TableDataSourceConfiguration } from "@app/lib/api/assistant/configuration/types";
import { getGlobalAgents } from "@app/lib/api/assistant/global_agents/global_agents";
import { agentConfigurationWasUpdatedBy } from "@app/lib/api/assistant/recent_authors";
import config from "@app/lib/api/config";
import { Authenticator } from "@app/lib/auth";
import { isRemoteDatabase } from "@app/lib/data_sources";
import type { DustError } from "@app/lib/error";
import { AgentDataSourceConfiguration } from "@app/lib/models/agent/actions/data_sources";
import {
  AgentChildAgentConfiguration,
  AgentMCPServerConfiguration,
} from "@app/lib/models/agent/actions/mcp";
import { AgentReasoningConfiguration } from "@app/lib/models/agent/actions/reasoning";
import { AgentTablesQueryConfigurationTable } from "@app/lib/models/agent/actions/tables_query";
import {
  AgentConfiguration,
  AgentUserRelation,
} from "@app/lib/models/agent/agent";
import { GroupAgentModel } from "@app/lib/models/agent/group_agent";
import { TagAgentModel } from "@app/lib/models/agent/tag_agent";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import {
  createResourcePermissionsFromSpacesWithMap,
  createSpaceIdToGroupsMap,
} from "@app/lib/resources/permission_utils";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import { TagResource } from "@app/lib/resources/tags_resource";
import { TemplateResource } from "@app/lib/resources/template_resource";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
import logger from "@app/logger/logger";
import type {
  AgentConfigurationScope,
  AgentConfigurationType,
  AgentFetchVariant,
  AgentModelConfigurationType,
  AgentStatus,
  LightAgentConfigurationType,
  ModelId,
  Result,
  UserType,
} from "@app/types";
import {
  CoreAPI,
  Err,
  isAdmin,
  isBuilder,
  isGlobalAgentId,
  MAX_STEPS_USE_PER_RUN_LIMIT,
  normalizeAsInternalDustError,
  Ok,
  removeNulls,
} from "@app/types";
import type { TagType } from "@app/types/tag";

export async function getAgentConfigurationsWithVersion<
  V extends AgentFetchVariant,
>(
  auth: Authenticator,
  agentIdsWithVersion: { agentId: string; agentVersion: number }[],
  { variant }: { variant: V }
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

  const workspaceAgentModels = await AgentConfiguration.findAll({
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

  const allowedAgentModels = await filterAgentsByRequestedSpaces(
    auth,
    workspaceAgentModels
  );
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
    const agentModels = await AgentConfiguration.findAll({
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
    if (!owner) {
      throw new Error("Unexpected `auth` without `workspace`.");
    }
    if (!auth.isUser()) {
      throw new Error("Unexpected `auth` without `user` permissions.");
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

      const agentModels = await AgentConfiguration.findAll({
        where: {
          workspaceId: owner.id,
          [Op.or]: latestVersions.map((v) => ({
            sId: v.sId,
            version: v.max_version,
          })),
        },
        order: [["version", "DESC"]],
      });
      const allowedAgentModels = await filterAgentsByRequestedSpaces(
        auth,
        agentModels
      );
      workspaceAgents = await enrichAgentConfigurations(
        auth,
        allowedAgentModels,
        { variant }
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
  }: { agentId: string; agentVersion?: number; variant: V }
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
    pictureUrl,
    status,
    scope,
    model,
    agentConfigurationId,
    templateId,
    requestedSpaceIds,
    tags,
    editors,
  }: {
    name: string;
    description: string;
    instructions: string | null;
    pictureUrl: string;
    status: AgentStatus;
    scope: Exclude<AgentConfigurationScope, "global">;
    model: AgentModelConfigurationType;
    agentConfigurationId?: string;
    templateId: string | null;
    requestedSpaceIds: number[];
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

  // For hidden agents, track previous editors to disable triggers when editors are removed.
  let previousEditorIds: Set<ModelId> = new Set();
  if (agentConfigurationId && scope === "hidden") {
    const existingAgent = await getAgentConfiguration(auth, {
      agentId: agentConfigurationId,
      variant: "light",
    });
    if (existingAgent) {
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

      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
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
          pictureUrl,
          workspaceId: owner.id,
          authorId: user.id,
          templateId: template?.id,
          requestedSpaceIds: requestedSpaceIds,
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
          await auth.refresh({ transaction: t });
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
          const setMembersRes = await group.setMembers(auth, editors, {
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

export async function createGenericAgentConfiguration(
  auth: Authenticator,
  {
    name,
    description,
    instructions,
    pictureUrl,
    model,
    subAgent,
  }: {
    name: string;
    description: string;
    instructions: string;
    pictureUrl: string;
    model: AgentModelConfigurationType;
    subAgent?: {
      name: string;
      description: string;
      instructions: string;
      pictureUrl: string;
    };
  }
): Promise<
  Result<
    {
      agentConfiguration: LightAgentConfigurationType;
      subAgentConfiguration?: LightAgentConfigurationType;
    },
    Error
  >
> {
  const owner = auth.workspace();
  if (!owner) {
    return new Err(new Error("Unexpected `auth` without `workspace`."));
  }

  const user = auth.user();
  if (!user) {
    return new Err(new Error("Unexpected `auth` without `user`."));
  }

  async function cleanupAgentsOnError(
    auth: Authenticator,
    mainAgentId: string | null,
    subAgentId: string | null
  ): Promise<void> {
    try {
      if (mainAgentId) {
        await archiveAgentConfiguration(auth, mainAgentId);
      }
      if (subAgentId) {
        await archiveAgentConfiguration(auth, subAgentId);
      }
    } catch (error) {
      logger.error(
        {
          error,
          mainAgentId,
          subAgentId,
        },
        "Failed to cleanup agents after error"
      );
    }
  }

  const result = await createAgentConfiguration(auth, {
    name,
    description,
    instructions,
    pictureUrl,
    status: "active",
    scope: "hidden", // Unpublished
    model,
    templateId: null,
    requestedSpaceIds: [],
    tags: [],
    editors: [user.toJSON()], // Only the current user as editor
  });

  if (result.isErr()) {
    return result;
  }

  const agentConfiguration = result.value;

  const [webSearchMCPServerView, searchMCPServerView] = await Promise.all([
    MCPServerViewResource.getMCPServerViewForAutoInternalTool(
      auth,
      "web_search_&_browse"
    ),
    MCPServerViewResource.getMCPServerViewForAutoInternalTool(auth, "search"),
  ]);

  if (!webSearchMCPServerView) {
    await cleanupAgentsOnError(auth, agentConfiguration.sId, null);
    return new Err(new Error("Could not find web search MCP server view"));
  }
  if (!searchMCPServerView) {
    await cleanupAgentsOnError(auth, agentConfiguration.sId, null);
    return new Err(new Error("Could not find search MCP server view"));
  }

  const webSearchResult = await createAgentActionConfiguration(
    auth,
    {
      type: "mcp_server_configuration",
      name: DEFAULT_WEBSEARCH_ACTION_NAME,
      description: DEFAULT_WEBSEARCH_ACTION_DESCRIPTION,
      mcpServerViewId: webSearchMCPServerView.sId,
      dataSources: null,
      reasoningModel: null,
      tables: null,
      childAgentId: null,
      additionalConfiguration: {},
      dustAppConfiguration: null,
      timeFrame: null,
      jsonSchema: null,
    } as ServerSideMCPServerConfigurationType,
    agentConfiguration
  );

  if (webSearchResult.isErr()) {
    await cleanupAgentsOnError(auth, agentConfiguration.sId, null);
    return new Err(
      new Error("Could not create web search action configuration")
    );
  }

  const dataSourceViews =
    await DataSourceViewResource.listAssistantDefaultSelected(auth);

  if (dataSourceViews.length > 0) {
    const searchResult = await createAgentActionConfiguration(
      auth,
      {
        type: "mcp_server_configuration",
        name: "data_sources_file_system",
        description: "Browse all workspace data sources as a file system.",
        mcpServerViewId: searchMCPServerView.sId,
        dataSources: dataSourceViews.map((dsView) => ({
          dataSourceViewId: dsView.sId,
          workspaceId: owner.sId,
          filter: { parents: null, tags: null },
        })),
        reasoningModel: null,
        tables: null,
        childAgentId: null,
        additionalConfiguration: {},
        dustAppConfiguration: null,
        timeFrame: null,
        jsonSchema: null,
      } as ServerSideMCPServerConfigurationType,
      agentConfiguration
    );

    if (searchResult.isErr()) {
      await cleanupAgentsOnError(auth, agentConfiguration.sId, null);
      return new Err(new Error("Could not create search action configuration"));
    }
  }

  // Add query_tables_v2 tools for data warehouses in global space.
  const queryTablesV2View =
    await MCPServerViewResource.getMCPServerViewForAutoInternalTool(
      auth,
      "query_tables_v2"
    );

  if (!queryTablesV2View) {
    await cleanupAgentsOnError(auth, agentConfiguration.sId, null);
    return new Err(new Error("Could not find query_tables_v2 MCP server view"));
  }

  const globalSpace = await SpaceResource.fetchWorkspaceGlobalSpace(auth);
  const globalDataSourceViews = await DataSourceViewResource.listBySpace(
    auth,
    globalSpace
  );

  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
  for (const dsView of globalDataSourceViews) {
    if (
      !isRemoteDatabase(dsView.dataSource) ||
      !dsView.dataSource.connectorId
    ) {
      continue;
    }

    const tablesRes = await coreAPI.getTables({
      projectId: dsView.dataSource.dustAPIProjectId,
      dataSourceId: dsView.dataSource.dustAPIDataSourceId,
      viewFilter: dsView.toViewFilter(),
    });

    if (tablesRes.isErr()) {
      await cleanupAgentsOnError(auth, agentConfiguration.sId, null);
      return new Err(
        new Error(
          `Failed to get tables for data warehouse "${dsView.dataSource.name}"`
        )
      );
    }

    const tables = tablesRes.value.tables;

    if (tables.length > 0) {
      const warehouseType =
        dsView.dataSource.connectorProvider === "snowflake"
          ? "Snowflake"
          : "BigQuery";

      const tableConfigs: TableDataSourceConfiguration[] = tables.map(
        (table) => ({
          workspaceId: owner.sId,
          dataSourceViewId: dsView.sId,
          tableId: table.table_id,
        })
      );

      const tablesQueryResult = await createAgentActionConfiguration(
        auth,
        {
          type: "mcp_server_configuration",
          name: `query_${dsView.dataSource.name}_data_warehouse`,
          description: `Query any of the tables available in the "${dsView.dataSource.name}" ${warehouseType} data warehouse.`,
          mcpServerViewId: queryTablesV2View.sId,
          dataSources: null,
          reasoningModel: null,
          tables: tableConfigs,
          childAgentId: null,
          additionalConfiguration: {},
          dustAppConfiguration: null,
          timeFrame: null,
          jsonSchema: null,
        } as ServerSideMCPServerConfigurationType,
        agentConfiguration
      );

      if (tablesQueryResult.isErr()) {
        logger.error(
          {
            error: tablesQueryResult.error,
            dataSourceName: dsView.dataSource.name,
            workspaceId: owner.sId,
          },
          "Failed to create query tool for data warehouse"
        );

        await cleanupAgentsOnError(auth, agentConfiguration.sId, null);
        return new Err(
          new Error(
            `Failed to create query tool for data warehouse "${dsView.dataSource.name}"`
          )
        );
      }
    }
  }

  if (!subAgent) {
    return new Ok({ agentConfiguration });
  }

  const subAgentResult = await createGenericAgentConfiguration(auth, {
    name: subAgent.name,
    description: subAgent.description,
    instructions: subAgent.instructions,
    pictureUrl: subAgent.pictureUrl,
    model,
  });

  if (subAgentResult.isErr()) {
    await cleanupAgentsOnError(auth, agentConfiguration.sId, null);
    return new Err(
      new Error(`Failed to create sub-agent: ${subAgentResult.error.message}`)
    );
  }

  const subAgentConfiguration = subAgentResult.value.agentConfiguration;
  const subAgentId = subAgentConfiguration.sId;

  const runAgentMCPServerView =
    await MCPServerViewResource.getMCPServerViewForAutoInternalTool(
      auth,
      "run_agent"
    );

  if (!runAgentMCPServerView) {
    await cleanupAgentsOnError(auth, agentConfiguration.sId, subAgentId);
    return new Err(new Error("Could not find run_agent MCP server view"));
  }

  const runAgentActionResult = await createAgentActionConfiguration(
    auth,
    {
      type: "mcp_server_configuration",
      name: `run_${subAgentConfiguration.name}`,
      description: `Run the ${subAgentConfiguration.name} sub-agent. The sub-agent has access to the same tools as the main agent, except for the ability to spawn sub-agents.`,
      mcpServerViewId: runAgentMCPServerView.sId,
      dataSources: null,
      reasoningModel: null,
      tables: null,
      childAgentId: subAgentConfiguration.sId,
      additionalConfiguration: {},
      dustAppConfiguration: null,
      timeFrame: null,
      jsonSchema: null,
    } as ServerSideMCPServerConfigurationType,
    agentConfiguration
  );

  if (runAgentActionResult.isErr()) {
    await cleanupAgentsOnError(auth, agentConfiguration.sId, subAgentId);
    return new Err(
      new Error("Could not create run_agent action configuration")
    );
  }

  return new Ok({ agentConfiguration, subAgentConfiguration });
}

export async function archiveAgentConfiguration(
  auth: Authenticator,
  agentConfigurationId: string
): Promise<boolean> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Unexpected `auth` without `workspace`.");
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

  // Re-enable all triggers for this agent after restoring
  if (updated[0] > 0) {
    const triggers = await TriggerResource.listByAgentConfigurationId(
      auth,
      agentConfigurationId
    );
    for (const trigger of triggers) {
      const editor = await UserResource.fetchByModelId(trigger.editor);
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

  const affectedCount = updated[0];
  return affectedCount > 0;
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
    const mcpConfigs = await AgentMCPServerConfiguration.findAll({
      where: {
        agentConfigurationId: agentConfiguration.id,
        workspaceId,
      },
      attributes: ["id"],
      transaction: t,
    });
    if (mcpConfigs.length) {
      const mcpIds = mcpConfigs.map((c) => c.id);

      await AgentDataSourceConfiguration.destroy({
        where: {
          workspaceId,
          mcpServerConfigurationId: { [Op.in]: mcpIds },
        },
        transaction: t,
      });

      await AgentTablesQueryConfigurationTable.destroy({
        where: {
          workspaceId,
          mcpServerConfigurationId: { [Op.in]: mcpIds },
        },
        transaction: t,
      });

      await AgentReasoningConfiguration.destroy({
        where: {
          workspaceId,
          mcpServerConfigurationId: { [Op.in]: mcpIds },
        },
        transaction: t,
      });

      await AgentChildAgentConfiguration.destroy({
        where: {
          workspaceId,
          mcpServerConfigurationId: { [Op.in]: mcpIds },
        },
        transaction: t,
      });

      await AgentMCPServerConfiguration.destroy({
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

    await AgentConfiguration.destroy({
      where: {
        id: agentConfiguration.id,
        workspaceId,
      },
      transaction: t,
    });
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
    const transactionResult = await withTransaction(async (t) => {
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

    if (transactionResult.isErr()) {
      return transactionResult;
    }

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

export async function updateAgentConfigurationScope(
  auth: Authenticator,
  agentConfigurationId: string,
  scope: Exclude<AgentConfigurationScope, "global">
) {
  const agentConfig = await getAgentConfiguration(auth, {
    agentId: agentConfigurationId,
    variant: "light",
  });

  if (!agentConfig) {
    return new Err(new Error(`Could not find agent ${agentConfigurationId}`));
  }

  const previousScope = agentConfig.scope;
  await AgentConfiguration.update(
    { scope },
    {
      where: {
        id: agentConfig.id,
      },
    }
  );

  // When scope changes from visible to hidden, disable triggers for non-editors.
  // Non-editors will no longer have access to the hidden agent.
  if (previousScope === "visible" && scope === "hidden") {
    const triggers = await TriggerResource.listByAgentConfigurationId(
      auth,
      agentConfigurationId
    );

    if (triggers.length > 0) {
      // Get the editor group to find who can still access the agent
      const editorGroupRes = await GroupResource.findEditorGroupForAgent(
        auth,
        agentConfig
      );

      let editorIds: Set<ModelId> = new Set();
      if (editorGroupRes.isOk()) {
        const members = await editorGroupRes.value.getActiveMembers(auth);
        editorIds = new Set(members.map((m) => m.id));
      }

      // Disable triggers for users who are not editors
      for (const trigger of triggers) {
        if (!editorIds.has(trigger.editor)) {
          const disableResult = await trigger.disable(auth);
          if (disableResult.isErr()) {
            logger.error(
              {
                workspaceId: auth.getNonNullableWorkspace().sId,
                agentConfigurationId,
                triggerId: trigger.sId,
                error: disableResult.error,
              },
              `Failed to disable trigger ${trigger.sId} when changing agent ${agentConfigurationId} scope to hidden`
            );
          }
        }
      }
    }
  }

  return new Ok(undefined);
}

export async function updateAgentRequirements(
  auth: Authenticator,
  params: { agentId: string; newSpaceIds: number[] },
  options?: { transaction?: Transaction }
): Promise<Result<boolean, Error>> {
  const { agentId, newSpaceIds } = params;

  const owner = auth.getNonNullableWorkspace();

  const updated = await AgentConfiguration.update(
    {
      requestedSpaceIds: newSpaceIds,
    },
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

export async function filterAgentsByRequestedSpaces(
  auth: Authenticator,
  agents: AgentConfiguration[]
) {
  const uniqSpaceIds = Array.from(
    new Set(agents.flatMap((agent) => agent.requestedSpaceIds))
  );

  const spaces = await SpaceResource.fetchByModelIds(auth, uniqSpaceIds);
  const spaceIdToGroupsMap = createSpaceIdToGroupsMap(auth, spaces);

  // Filter out agents that reference missing/deleted spaces.
  // When a space is deleted, mcp actions are removed, and requestedSpaceIds are updated.
  const foundSpaceIds = new Set(spaces.map((s) => s.id));
  const validAgents = agents.filter((c) =>
    c.requestedSpaceIds.every((id) => foundSpaceIds.has(Number(id)))
  );

  const allowedBySpaceIds = validAgents.filter((agent) =>
    auth.canRead(
      createResourcePermissionsFromSpacesWithMap(
        spaceIdToGroupsMap,
        // Parse as Number since Sequelize array of BigInts are returned as strings.
        agent.requestedSpaceIds.map((id) => Number(id))
      )
    )
  );

  return allowedBySpaceIds;
}
