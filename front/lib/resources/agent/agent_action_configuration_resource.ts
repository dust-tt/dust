import type {
  CustomResourceIconType,
  InternalAllowedIconType,
} from "@app/components/resources/resources_icons";
import type { MCPServerConfigurationType } from "@app/lib/actions/mcp";
import type {
  UnsavedMCPServerConfigurationType,
  UnsavedServerSideMCPServerConfigurationType,
} from "@app/lib/actions/types/agent";
import { isServerSideMCPServerConfiguration } from "@app/lib/actions/types/guards";
import { WEB_SEARCH_BROWSE_SERVER_NAME } from "@app/lib/api/actions/servers/web_search_browse/metadata";
import type {
  DataSourceConfiguration,
  DataSourceFilter,
  ProjectConfiguration,
  TableDataSourceConfiguration,
} from "@app/lib/api/assistant/configuration/types";
import type { Authenticator } from "@app/lib/auth";
import { AgentDataSourceConfigurationModel } from "@app/lib/models/agent/actions/data_sources";
import {
  AgentChildAgentConfigurationModel,
  AgentMCPServerConfigurationModel,
} from "@app/lib/models/agent/actions/mcp";
import { AgentProjectConfigurationModel } from "@app/lib/models/agent/actions/projects";
import { AgentTablesQueryConfigurationTableModel } from "@app/lib/models/agent/actions/tables_query";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { AgentSearchIndexationResource } from "@app/lib/resources/agent/agent_search_indexation_resource";
import { AppResource } from "@app/lib/resources/app_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { DataSourceViewModel } from "@app/lib/resources/storage/models/data_source_view";
import { SpaceModel } from "@app/lib/resources/storage/models/spaces";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { makeSId } from "@app/lib/resources/string_ids";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { withTransaction } from "@app/lib/utils/sql_utils";
import logger from "@app/logger/logger";
import type {
  AgentFetchVariant,
  LightAgentConfigurationType,
} from "@app/types/assistant/agent";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { removeNulls } from "@app/types/shared/utils/general";
import assert from "assert";
import groupBy from "lodash/groupBy";
import type {
  CreationAttributes,
  IncludeOptions,
  Transaction,
  WhereOptions,
} from "sequelize";
import { Op } from "sequelize";

type PreparedAgentAction = {
  action: UnsavedServerSideMCPServerConfigurationType;
  mcpServerView: MCPServerViewResource;
};

export class AgentActionConfigurationResource {
  private static toDataSourceJSON(
    auth: Authenticator,
    dataSourceConfig: AgentDataSourceConfigurationModel
  ): DataSourceConfiguration & { sId: string } {
    let tags: DataSourceFilter["tags"] = null;

    if (dataSourceConfig.tagsMode) {
      tags = {
        in: dataSourceConfig.tagsIn ?? [],
        not: dataSourceConfig.tagsNotIn ?? [],
        mode: dataSourceConfig.tagsMode,
      };
    }

    return {
      sId: makeSId("data_source_configuration", {
        id: dataSourceConfig.id,
        workspaceId: dataSourceConfig.workspaceId,
      }),
      workspaceId: auth.getNonNullableWorkspace().sId,
      dataSourceViewId: DataSourceViewResource.modelIdToSId({
        id: dataSourceConfig.dataSourceViewId,
        workspaceId: dataSourceConfig.workspaceId,
      }),
      filter: {
        parents:
          dataSourceConfig.parentsIn !== null ||
          dataSourceConfig.parentsNotIn !== null
            ? {
                in: dataSourceConfig.parentsIn,
                not: dataSourceConfig.parentsNotIn,
              }
            : null,
        tags,
      },
    };
  }

  private static toTableJSON(
    table: AgentTablesQueryConfigurationTableModel
  ): TableDataSourceConfiguration & { sId: string } {
    const { dataSourceView } = table;

    return {
      sId: makeSId("table_configuration", {
        id: table.id,
        workspaceId: dataSourceView.workspaceId,
      }),
      dataSourceViewId: DataSourceViewResource.modelIdToSId({
        id: dataSourceView.id,
        workspaceId: dataSourceView.workspaceId,
      }),
      workspaceId: dataSourceView.workspace.sId,
      tableId: table.tableId,
    };
  }

  private static toProjectJSON(
    project: AgentProjectConfigurationModel
  ): ProjectConfiguration {
    const { project: space } = project;

    return {
      workspaceId: project.workspace.sId,
      projectId: SpaceResource.modelIdToSId({
        id: space.id,
        workspaceId: space.workspaceId,
      }),
    };
  }

  static getDataSourceViewIds(
    actions: UnsavedMCPServerConfigurationType[]
  ): string[] {
    return [
      ...new Set(
        actions
          .filter(isServerSideMCPServerConfiguration)
          .flatMap((action) => [
            ...(action.dataSources ?? []).map(
              (source) => source.dataSourceViewId
            ),
            ...(action.tables ?? []).map((table) => table.dataSourceViewId),
          ])
      ),
    ];
  }

  /**
   * @cc [owner:aubin-tchoi,label:backend;security;performance] batched-capability-space-requirements
   * Requirements include data-source views, non-auto tools, apps and attached skills for each
   * input, with shared batched lookups and explicit ignored spaces removed from each result.
   */
  static async getSpaceRequirements(
    auth: Authenticator,
    capabilities: {
      actions: UnsavedMCPServerConfigurationType[];
      skills: SkillResource[];
    }[],
    {
      transaction,
      ignoreSpaces = [],
    }: { transaction?: Transaction; ignoreSpaces?: SpaceResource[] } = {}
  ): Promise<{ requestedSpaceIds: ModelId[] }[]> {
    if (capabilities.length === 0) {
      return [];
    }
    const references = capabilities.map(({ actions, skills }) => {
      const serverActions = actions.filter(isServerSideMCPServerConfiguration);
      return {
        dataSourceViewIds: this.getDataSourceViewIds(actions),
        mcpServerViewIds: serverActions.map((action) => action.mcpServerViewId),
        appIds: removeNulls(
          serverActions.map((action) => action.dustAppConfiguration?.appId)
        ),
        skillSpaceIds: skills.flatMap((skill) => skill.requestedSpaceIds),
      };
    });
    const [dataSourceViews, toolSpaces, apps] = await Promise.all([
      DataSourceViewResource.fetchByIds(
        auth,
        [...new Set(references.flatMap((ref) => ref.dataSourceViewIds))],
        { transaction }
      ),
      MCPServerViewResource.listSpaceRequirementsById(
        auth,
        [...new Set(references.flatMap((ref) => ref.mcpServerViewIds))],
        { transaction }
      ),
      AppResource.fetchByIds(
        auth,
        [...new Set(references.flatMap((ref) => ref.appIds))],
        { transaction }
      ),
    ]);
    const dataSourceSpaces = new Map(
      dataSourceViews.map((view) => [view.sId, view.space.id])
    );
    const appSpaces = new Map(apps.map((app) => [app.sId, app.space.id]));
    const ignoredIds = new Set(ignoreSpaces.map((space) => space.id));
    return references.map((ref) => ({
      requestedSpaceIds: [
        ...new Set([
          ...removeNulls(
            ref.dataSourceViewIds.map((id) => dataSourceSpaces.get(id))
          ),
          ...removeNulls(ref.mcpServerViewIds.map((id) => toolSpaces.get(id))),
          ...removeNulls(ref.appIds.map((id) => appSpaces.get(id))),
          ...ref.skillSpaceIds,
        ]),
      ].filter((id) => !ignoredIds.has(id)),
    }));
  }

  /**
   * @cc [owner:aubin-tchoi,label:backend;performance] batched-agent-action-hydration
   * Full action reads are workspace-scoped, join the supplied transaction and batch related
   * records across configurations; lighter variants do not load actions.
   */
  static async fetchConfigurations(
    auth: Authenticator,
    {
      configurationIds,
      variant,
      transaction,
    }: {
      configurationIds: ModelId[];
      variant: AgentFetchVariant;
      transaction?: Transaction;
    }
  ): Promise<Map<ModelId, MCPServerConfigurationType[]>> {
    if (variant !== "full" || configurationIds.length === 0) {
      return new Map();
    }

    const mcpServerConfigurations =
      await AgentMCPServerConfigurationModel.findAll({
        transaction,
        where: {
          agentConfigurationId: { [Op.in]: configurationIds },
          workspaceId: auth.getNonNullableWorkspace().id,
        },
      });

    if (mcpServerConfigurations.length === 0) {
      return new Map();
    }

    const workspace = auth.getNonNullableWorkspace();

    const whereClause: WhereOptions<
      AgentDataSourceConfigurationModel &
        AgentTablesQueryConfigurationTableModel &
        AgentChildAgentConfigurationModel
    > = {
      workspaceId: workspace.id,
      mcpServerConfigurationId: {
        [Op.in]: mcpServerConfigurations.map((r) => r.id),
      },
    };
    const includeDataSourceViewClause: IncludeOptions[] = [
      {
        model: DataSourceViewModel,
        as: "dataSourceView",
        include: [
          {
            model: WorkspaceModel,
            as: "workspace",
          },
        ],
      },
    ];

    const uniqueMcpServerViewIds = Array.from(
      new Set(mcpServerConfigurations.map((r) => r.mcpServerViewId))
    );

    const [
      allDustApps,
      allDataSourceConfigurations,
      allTablesConfigurations,
      allChildAgentConfigurations,
      allProjectConfigurations,
      allMcpServerViews,
    ] = await Promise.all([
      AppResource.fetchByIds(
        auth,
        removeNulls(mcpServerConfigurations.map((r) => r.appId)),
        { transaction }
      ),
      // Find the associated data sources configurations.
      AgentDataSourceConfigurationModel.findAll({
        where: whereClause,
        transaction,
        include: includeDataSourceViewClause,
      }),
      // Find the associated tables configurations.
      AgentTablesQueryConfigurationTableModel.findAll({
        where: whereClause,
        transaction,
        include: includeDataSourceViewClause,
      }),
      // Find the associated child agent configurations.
      AgentChildAgentConfigurationModel.findAll({
        where: whereClause,
        transaction,
      }),
      // Find the associated project configurations.
      AgentProjectConfigurationModel.findAll({
        where: whereClause,
        transaction,
        include: [
          {
            model: WorkspaceModel,
            as: "workspace",
          },
          {
            model: SpaceModel,
            as: "project",
          },
        ],
      }),
      MCPServerViewResource.fetchByModelIds(auth, uniqueMcpServerViewIds, {
        transaction,
      }),
    ]);

    const mcpServerViewsById = new Map(
      allMcpServerViews.map((view) => [view.id, view])
    );

    const dataSourcesByConfigId = groupBy(
      allDataSourceConfigurations,
      "mcpServerConfigurationId"
    );
    const tablesByConfigId = groupBy(
      allTablesConfigurations,
      "mcpServerConfigurationId"
    );
    const childrenByConfigId = groupBy(
      allChildAgentConfigurations,
      "mcpServerConfigurationId"
    );
    const projectsByConfigId = groupBy(
      allProjectConfigurations,
      "mcpServerConfigurationId"
    );
    const appsById = new Map(allDustApps.map((app) => [app.sId, app]));

    const actionsByConfigurationId = new Map<
      ModelId,
      MCPServerConfigurationType[]
    >();
    for (const config of mcpServerConfigurations) {
      const { agentConfigurationId, mcpServerViewId } = config;

      const dataSourceConfigurations = dataSourcesByConfigId[config.id] ?? [];
      const tablesConfigurations = tablesByConfigId[config.id] ?? [];
      const childAgentConfigurations = childrenByConfigId[config.id] ?? [];
      const projectConfigurations = projectsByConfigId[config.id] ?? [];
      const dustApp = config.appId ? appsById.get(config.appId) : undefined;

      const mcpServerView = mcpServerViewsById.get(mcpServerViewId) ?? null;
      let serverName: string | null = null;
      let serverDescription: string | null = null;
      let serverIcon:
        | InternalAllowedIconType
        | CustomResourceIconType
        | undefined = undefined;
      let serverMeta: Record<string, string> | undefined = undefined;

      if (!mcpServerView) {
        logger.warn(
          `MCPServerView with mcpServerViewId ${mcpServerViewId} not found.`
        );
        serverName = "Missing";
        serverDescription = "Missing";
      } else {
        const { name, description, icon, meta } =
          mcpServerView.getServerDisplayMetadata();

        serverName = name;
        serverDescription = description;
        serverIcon = icon;
        serverMeta = meta ?? undefined;
      }
      if (!actionsByConfigurationId.has(agentConfigurationId)) {
        actionsByConfigurationId.set(agentConfigurationId, []);
      }

      const actions = actionsByConfigurationId.get(agentConfigurationId);
      if (actions) {
        actions.push({
          id: config.id,
          sId: config.sId,
          type: "mcp_server_configuration",
          // Name will be either set from the agent config itself (user defined), from the mcp server view (user defined), or from the server itself (fetched from the metadata).
          name: config.name ?? mcpServerView?.name ?? serverName,
          description:
            config.singleToolDescriptionOverride ?? serverDescription,
          icon: serverIcon,
          mcpServerViewId: mcpServerView?.sId ?? "",
          internalMCPServerId: config.internalMCPServerId,
          dataSources:
            dataSourceConfigurations.length > 0
              ? dataSourceConfigurations.map((ds) =>
                  this.toDataSourceJSON(auth, ds)
                )
              : null,
          tables:
            tablesConfigurations.length > 0
              ? tablesConfigurations.map((table) => this.toTableJSON(table))
              : null,
          dustAppConfiguration: dustApp?.toAgentActionJSON(auth) ?? null,
          childAgentId:
            childAgentConfigurations.length > 0
              ? childAgentConfigurations[0].agentConfigurationId
              : null,
          meta: serverMeta,
          additionalConfiguration: config.additionalConfiguration,
          timeFrame: config.timeFrame,
          jsonSchema: config.jsonSchema,
          secretName: config.secretName,
          dustProject:
            projectConfigurations.length > 0
              ? this.toProjectJSON(projectConfigurations[0])
              : null,
        });
      }
    }

    return actionsByConfigurationId;
  }

  // Database-only aggregate primitive: the owning agent mutation schedules indexation.
  static async deleteForConfigurations(
    auth: Authenticator,
    configurationModelIds: ModelId[],
    { transaction }: { transaction: Transaction }
  ): Promise<void> {
    const workspaceId = auth.getNonNullableWorkspace().id;
    const configurations = await AgentMCPServerConfigurationModel.findAll({
      attributes: ["id"],
      where: { workspaceId, agentConfigurationId: configurationModelIds },
      transaction,
    });
    const ids = configurations.map((configuration) => configuration.id);
    if (ids.length === 0) {
      return;
    }
    const options = {
      where: { workspaceId, mcpServerConfigurationId: ids },
      transaction,
    };
    await AgentDataSourceConfigurationModel.destroy(options);
    await AgentTablesQueryConfigurationTableModel.destroy(options);
    await AgentChildAgentConfigurationModel.destroy(options);
    await AgentProjectConfigurationModel.destroy(options);
    await AgentMCPServerConfigurationModel.destroy({
      where: { workspaceId, id: ids },
      transaction,
    });
  }

  /**
   * @cc [owner:aubin-tchoi,label:backend;security] standalone-agent-tool-indexation
   * Standalone tool creation validates the agent workspace, commits all child configurations
   * atomically, and refreshes the logical agent's search document after the outer commit.
   */
  static async createAgentActionConfiguration(
    auth: Authenticator,
    action: UnsavedMCPServerConfigurationType,
    agentConfiguration: LightAgentConfigurationType,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<MCPServerConfigurationType, Error>> {
    assert(isServerSideMCPServerConfiguration(action));
    const mcpServerView = await MCPServerViewResource.fetchById(
      auth,
      action.mcpServerViewId
    );
    if (!mcpServerView) {
      return new Err(new Error("MCP server view not found"));
    }
    const workspace = auth.getNonNullableWorkspace();
    const { configurations, agentId } = await withTransaction(
      async (t) => {
        const agent = await AgentConfigurationModel.findOne({
          attributes: ["sId"],
          where: { id: agentConfiguration.id, workspaceId: workspace.id },
          transaction: t,
        });
        assert(
          agent,
          "Agent configuration must belong to the caller's workspace."
        );
        const configurations = await this.createManyWithServerViews(auth, {
          actions: [{ action, mcpServerView }],
          agentConfigurationModelId: agentConfiguration.id,
          transaction: t,
        });
        return { configurations, agentId: agent.sId };
      },
      transaction,
      { useSavepoint: true }
    );
    const [configuration] = configurations;
    assert(configuration);
    await AgentSearchIndexationResource.launch(
      { workspaceId: workspace.sId, agentIds: [agentId] },
      { transaction }
    );
    return new Ok(configuration);
  }

  /**
   * @cc [owner:aubin-tchoi,label:backend;performance] batched-agent-capabilities
   * All tools and their child configurations join the caller's transaction; relation reads and
   * writes are batched across tools and never perform one database query per tool.
   */
  static async createManyWithServerViews(
    auth: Authenticator,
    {
      actions,
      agentConfigurationModelId,
      transaction,
    }: {
      actions: PreparedAgentAction[];
      agentConfigurationModelId: ModelId;
      transaction: Transaction;
    }
  ): Promise<MCPServerConfigurationType[]> {
    if (actions.length === 0) {
      return [];
    }
    const workspace = auth.getNonNullableWorkspace();
    assert(
      actions.every(
        ({ mcpServerView }) => mcpServerView.workspaceId === workspace.id
      )
    );
    const inputs = actions.map((input) => ({
      ...input,
      configurationId: generateRandomModelSId(),
    }));
    const configs = await AgentMCPServerConfigurationModel.bulkCreate(
      inputs.map(({ action, mcpServerView, configurationId }) => {
        const { name, description } = mcpServerView.getServerDisplayMetadata();
        return {
          sId: configurationId,
          agentConfigurationId: agentConfigurationModelId,
          workspaceId: workspace.id,
          mcpServerViewId: mcpServerView.id,
          internalMCPServerId: mcpServerView.internalMCPServerId,
          additionalConfiguration: action.additionalConfiguration,
          timeFrame: action.timeFrame,
          jsonSchema: action.jsonSchema,
          name:
            name !== action.name && name !== WEB_SEARCH_BROWSE_SERVER_NAME
              ? action.name
              : null,
          singleToolDescriptionOverride:
            description !== action.description ? action.description : null,
          appId: action.dustAppConfiguration?.appId ?? null,
          secretName: action.secretName ?? null,
        };
      }),
      { transaction, validate: true }
    );
    const configById = new Map(configs.map((config) => [config.sId, config]));
    const configurations = inputs.map(
      ({ action, mcpServerView, configurationId }) => {
        const config = configById.get(configurationId);
        assert(config);
        return { action, mcpServerView, config };
      }
    );

    const dataSourceInputs = configurations.flatMap(
      ({ action }) => action.dataSources ?? []
    );
    const tableInputs = configurations.flatMap(
      ({ action }) => action.tables ?? []
    );
    assert(
      [...dataSourceInputs, ...tableInputs].every(
        (input) => input.workspaceId === workspace.sId
      )
    );
    const dataSourceViewIds = [
      ...new Set(
        [...dataSourceInputs, ...tableInputs].map(
          (input) => input.dataSourceViewId
        )
      ),
    ];
    const dataSourceViews =
      dataSourceViewIds.length > 0
        ? await DataSourceViewResource.fetchByIds(auth, dataSourceViewIds)
        : [];
    const readableViewById = new Map(
      dataSourceViews
        .filter((view) => view.canReadOrAdministrate(auth))
        .map((view) => [view.sId, view])
    );
    const projectIds = [
      ...new Set(
        configurations.flatMap(({ action }) =>
          action.dustProject ? [action.dustProject.projectId] : []
        )
      ),
    ];
    const spaces =
      projectIds.length > 0
        ? await SpaceResource.fetchByIds(auth, projectIds)
        : [];
    const spaceById = new Map(spaces.map((space) => [space.sId, space]));

    const dataSources: CreationAttributes<AgentDataSourceConfigurationModel>[] =
      [];
    const tables: CreationAttributes<AgentTablesQueryConfigurationTableModel>[] =
      [];
    const children: CreationAttributes<AgentChildAgentConfigurationModel>[] =
      [];
    const projects: CreationAttributes<AgentProjectConfigurationModel>[] = [];
    for (const { action, config } of configurations) {
      for (const input of action.dataSources ?? []) {
        const view = readableViewById.get(input.dataSourceViewId);
        if (!view) {
          logger.warn(
            { dataSourceViewId: input.dataSourceViewId },
            "Skipping unavailable agent data source view"
          );
          continue;
        }
        dataSources.push({
          workspaceId: workspace.id,
          mcpServerConfigurationId: config.id,
          dataSourceId: view.dataSource.id,
          dataSourceViewId: view.id,
          parentsIn: input.filter.parents?.in,
          parentsNotIn: input.filter.parents?.not,
          tagsMode: input.filter.tags?.mode ?? null,
          tagsIn: input.filter.tags?.in ?? null,
          tagsNotIn: input.filter.tags?.not ?? null,
        });
      }
      for (const input of action.tables ?? []) {
        const view = readableViewById.get(input.dataSourceViewId);
        if (!view) {
          logger.warn(
            { dataSourceViewId: input.dataSourceViewId },
            "Skipping unavailable agent table view"
          );
          continue;
        }
        tables.push({
          workspaceId: workspace.id,
          mcpServerConfigurationId: config.id,
          dataSourceId: view.dataSource.id,
          dataSourceViewId: view.id,
          tableId: input.tableId,
        });
      }
      if (action.childAgentId) {
        children.push({
          workspaceId: workspace.id,
          mcpServerConfigurationId: config.id,
          agentConfigurationId: action.childAgentId,
        });
      }
      if (action.dustProject) {
        const space = spaceById.get(action.dustProject.projectId);
        if (space) {
          projects.push({
            workspaceId: workspace.id,
            mcpServerConfigurationId: config.id,
            projectId: space.id,
          });
        } else {
          logger.warn(
            { projectId: action.dustProject.projectId },
            "Skipping unavailable agent project"
          );
        }
      }
    }
    if (dataSources.length) {
      await AgentDataSourceConfigurationModel.bulkCreate(dataSources, {
        transaction,
      });
    }
    if (tables.length) {
      await AgentTablesQueryConfigurationTableModel.bulkCreate(tables, {
        transaction,
      });
    }
    if (children.length) {
      await AgentChildAgentConfigurationModel.bulkCreate(children, {
        transaction,
      });
    }
    if (projects.length) {
      await AgentProjectConfigurationModel.bulkCreate(projects, {
        transaction,
      });
    }

    return configurations.map(({ action, mcpServerView, config }) => ({
      ...action,
      id: config.id,
      sId: config.sId,
      internalMCPServerId: mcpServerView.internalMCPServerId,
    }));
  }
}
