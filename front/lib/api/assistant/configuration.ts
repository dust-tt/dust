import type {
  AgentActionConfigurationType,
  AgentConfigurationScope,
  AgentConfigurationType,
  AgentModelConfigurationType,
  AgentsGetViewType,
  AgentStatus,
  AppType,
  DataSourceConfiguration,
  LightAgentConfigurationType,
  ModelId,
  ProcessSchemaPropertyType,
  ProcessTagsFilter,
  Result,
  RetrievalQuery,
  RetrievalTimeframe,
  TableDataSourceConfiguration,
  WorkspaceType,
} from "@dust-tt/types";
import {
  assertNever,
  compareAgentsForSort,
  Err,
  isTimeFrame,
  MAX_STEPS_USE_PER_RUN_LIMIT,
  Ok,
  removeNulls,
} from "@dust-tt/types";
import assert from "assert";
import type { Order, Transaction } from "sequelize";
import { Op, Sequelize, UniqueConstraintError } from "sequelize";

import {
  DEFAULT_BROWSE_ACTION_NAME,
  DEFAULT_PROCESS_ACTION_NAME,
  DEFAULT_RETRIEVAL_ACTION_NAME,
  DEFAULT_TABLES_QUERY_ACTION_NAME,
  DEFAULT_WEBSEARCH_ACTION_NAME,
} from "@app/lib/api/assistant/actions/names";
import { fetchBrowseActionConfigurations } from "@app/lib/api/assistant/configuration/browse";
import { fetchDustAppRunActionConfigurations } from "@app/lib/api/assistant/configuration/dust_app_run";
import { fetchAgentProcessActionConfigurations } from "@app/lib/api/assistant/configuration/process";
import { fetchAgentRetrievalActionConfigurations } from "@app/lib/api/assistant/configuration/retrieval";
import {
  createTableDataSourceConfiguration,
  fetchTableQueryActionConfigurations,
} from "@app/lib/api/assistant/configuration/table_query";
import { fetchWebsearchActionConfigurations } from "@app/lib/api/assistant/configuration/websearch";
import { getFavoriteStates } from "@app/lib/api/assistant/get_favorite_states";
import {
  getGlobalAgents,
  isGlobalAgentId,
} from "@app/lib/api/assistant/global_agents";
import { agentConfigurationWasUpdatedBy } from "@app/lib/api/assistant/recent_authors";
import { Authenticator } from "@app/lib/auth";
import { getPublicUploadBucket } from "@app/lib/file_storage";
import { AgentBrowseConfiguration } from "@app/lib/models/assistant/actions/browse";
import { AgentDataSourceConfiguration } from "@app/lib/models/assistant/actions/data_sources";
import { AgentDustAppRunConfiguration } from "@app/lib/models/assistant/actions/dust_app_run";
import { AgentProcessConfiguration } from "@app/lib/models/assistant/actions/process";
import { AgentRetrievalConfiguration } from "@app/lib/models/assistant/actions/retrieval";
import { AgentTablesQueryConfiguration } from "@app/lib/models/assistant/actions/tables_query";
import { AgentWebsearchConfiguration } from "@app/lib/models/assistant/actions/websearch";
import {
  AgentConfiguration,
  AgentUserRelation,
} from "@app/lib/models/assistant/agent";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { generateLegacyModelSId } from "@app/lib/resources/string_ids";
import { TemplateResource } from "@app/lib/resources/template_resource";

type SortStrategyType = "alphabetical" | "priority" | "updatedAt";

interface SortStrategy {
  dbOrder: Order | undefined;
  compareFunction: (
    a: AgentConfigurationType,
    b: AgentConfigurationType
  ) => number;
}

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

/**
 * Get an agent configuration
 *
 */
export async function getAgentConfiguration(
  auth: Authenticator,
  agentId: string
): Promise<AgentConfigurationType | null> {
  const res = await getAgentConfigurations({
    auth,
    agentsGetView: { agentIds: [agentId] },
    variant: "full",
  });
  return res[0] || null;
}

/**
 * Search agent configurations by name
 *
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
      scope: { [Op.in]: ["workspace", "published"] },
      name: {
        [Op.iLike]: `%${name}%`,
      },
    },
  });
  const r = removeNulls(
    await getAgentConfigurations({
      auth,
      agentsGetView: { agentIds: agentConfigurations.map((c) => c.sId) },
      variant: "light",
    })
  );

  return r;
}

function makeApplySortAndLimit(sort?: SortStrategyType, limit?: number) {
  return (results: AgentConfigurationType[]) => {
    const sortStrategy = sort && sortStrategies[sort];

    const sortedResults = sortStrategy
      ? results.sort(sortStrategy.compareFunction)
      : results;

    return limit ? sortedResults.slice(0, limit) : sortedResults;
  };
}

export async function getLightAgentConfiguration(
  auth: Authenticator,
  agentId: string
): Promise<LightAgentConfigurationType | null> {
  const res = await getAgentConfigurations({
    auth,
    agentsGetView: { agentIds: [agentId] },
    variant: "light",
  });
  return res[0] || null;
}

// Global agent configurations.

function determineGlobalAgentIdsToFetch(
  agentsGetView: AgentsGetViewType
): string[] | undefined {
  switch (agentsGetView) {
    case "workspace":
    case "published":
    case "archived":
      return []; // fetch no global agents
    case "global":
    case "list":
    case "all":
    case "admin_internal":
      return undefined; // undefined means all global agents will be fetched
    default:
      if (typeof agentsGetView === "object" && "agentIds" in agentsGetView) {
        return agentsGetView.agentIds.filter(isGlobalAgentId);
      }
      assertNever(agentsGetView);
  }
}

async function fetchGlobalAgentConfigurationForView(
  auth: Authenticator,
  {
    agentPrefix,
    agentsGetView,
  }: {
    agentPrefix?: string;
    agentsGetView: AgentsGetViewType;
  }
) {
  const globalAgentIdsToFetch = determineGlobalAgentIdsToFetch(agentsGetView);
  const allGlobalAgents = await getGlobalAgents(auth, globalAgentIdsToFetch);
  const matchingGlobalAgents = allGlobalAgents.filter(
    (a) =>
      !agentPrefix || a.name.toLowerCase().startsWith(agentPrefix.toLowerCase())
  );

  if (
    agentsGetView === "global" ||
    (typeof agentsGetView === "object" && "agentIds" in agentsGetView)
  ) {
    // All global agents in global and agent views.
    return matchingGlobalAgents;
  }

  // If not in global or agent view, filter out global agents that are not active.
  return matchingGlobalAgents.filter((a) => a.status === "active");
}

// Workspace agent configurations.

async function fetchWorkspaceAgentConfigurationsWithoutActions(
  auth: Authenticator,
  {
    agentPrefix,
    agentsGetView,
    limit,
    owner,
    sort,
  }: {
    agentPrefix?: string;
    agentsGetView: Exclude<AgentsGetViewType, "global">;
    limit?: number;
    owner: WorkspaceType;
    sort?: SortStrategyType;
  }
): Promise<AgentConfiguration[]> {
  const sortStrategy = sort && sortStrategies[sort];

  const baseWhereConditions = {
    workspaceId: owner.id,
    status: "active",
    ...(agentPrefix ? { name: { [Op.iLike]: `${agentPrefix}%` } } : {}),
  };

  const baseAgentsSequelizeQuery = {
    limit,
    order: sortStrategy?.dbOrder,
  };

  const baseConditionsAndScopesIn = (scopes: string[]) => ({
    ...baseWhereConditions,
    scope: { [Op.in]: scopes },
  });

  switch (agentsGetView) {
    case "admin_internal":
      return AgentConfiguration.findAll({
        ...baseAgentsSequelizeQuery,
        where: baseWhereConditions,
      });
    case "archived":
      // Get the latest version of all archived agents.
      // For each sId, we want to fetch the one with the highest version, only if it's status is "archived".
      return AgentConfiguration.findAll({
        attributes: [[Sequelize.fn("MAX", Sequelize.col("id")), "maxId"]],
        group: "sId",
        raw: true,
        where: {
          workspaceId: owner.id,
        },
      }).then(async (result) => {
        const maxIds = result.map(
          (entry) => (entry as unknown as { maxId: number }).maxId
        );

        return AgentConfiguration.findAll({
          where: {
            id: {
              [Op.in]: maxIds,
            },
            status: "archived",
          },
        });
      });

    case "all":
      return AgentConfiguration.findAll({
        ...baseAgentsSequelizeQuery,
        where: baseConditionsAndScopesIn(["workspace", "published"]),
      });

    case "workspace":
      return AgentConfiguration.findAll({
        ...baseAgentsSequelizeQuery,
        where: baseConditionsAndScopesIn(["workspace"]),
      });

    case "published":
      return AgentConfiguration.findAll({
        ...baseAgentsSequelizeQuery,
        where: baseConditionsAndScopesIn(["published"]),
      });

    case "list":
      const user = auth.user();

      const sharedAssistants = await AgentConfiguration.findAll({
        ...baseAgentsSequelizeQuery,
        where: {
          ...baseWhereConditions,
          scope: { [Op.in]: ["workspace", "published"] },
        },
      });
      if (!user) {
        return sharedAssistants;
      }

      const userAssistants = await AgentConfiguration.findAll({
        ...baseAgentsSequelizeQuery,
        where: {
          ...baseWhereConditions,
          authorId: user.id,
          scope: "private",
        },
      });

      return [...sharedAssistants, ...userAssistants];
    default:
      if (typeof agentsGetView === "object" && "agentIds" in agentsGetView) {
        return AgentConfiguration.findAll({
          where: {
            workspaceId: owner.id,
            ...(agentPrefix ? { name: { [Op.iLike]: `${agentPrefix}%` } } : {}),
            sId: agentsGetView.agentIds.filter((id) => !isGlobalAgentId(id)),
          },
          order: [["version", "DESC"]],
          ...(agentsGetView.allVersions ? {} : { limit: 1 }),
        });
      }
      assertNever(agentsGetView);
  }
}

async function fetchWorkspaceAgentConfigurationsForView(
  auth: Authenticator,
  owner: WorkspaceType,
  {
    agentPrefix,
    agentsGetView,
    limit,
    sort,
    variant,
  }: {
    agentPrefix?: string;
    agentsGetView: Exclude<AgentsGetViewType, "global">;
    limit?: number;
    sort?: SortStrategyType;
    variant: "light" | "full";
  }
) {
  const user = auth.user();

  const agentConfigurations =
    await fetchWorkspaceAgentConfigurationsWithoutActions(auth, {
      agentPrefix,
      agentsGetView,
      limit,
      owner,
      sort,
    });

  const configurationIds = agentConfigurations.map((a) => a.id);
  const configurationSIds = agentConfigurations.map((a) => a.sId);

  const [
    retrievalActionsConfigurationsPerAgent,
    processActionsConfigurationsPerAgent,
    dustAppRunActionsConfigurationsPerAgent,
    tableQueryActionsConfigurationsPerAgent,
    websearchActionsConfigurationsPerAgent,
    browseActionsConfigurationsPerAgent,
    favoriteStatePerAgent,
  ] = await Promise.all([
    fetchAgentRetrievalActionConfigurations({ configurationIds, variant }),
    fetchAgentProcessActionConfigurations({ configurationIds, variant }),
    fetchDustAppRunActionConfigurations(auth, { configurationIds, variant }),
    fetchTableQueryActionConfigurations({ configurationIds, variant }),
    fetchWebsearchActionConfigurations({ configurationIds, variant }),
    fetchBrowseActionConfigurations({ configurationIds, variant }),
    user
      ? getFavoriteStates(auth, { configurationIds: configurationSIds })
      : Promise.resolve(new Map<string, boolean>()),
  ]);

  const agentConfigurationTypes: AgentConfigurationType[] = [];
  for (const agent of agentConfigurations) {
    const actions: AgentActionConfigurationType[] = [];

    if (variant === "full") {
      // Retrieval configurations.
      const retrievalActionsConfigurations =
        retrievalActionsConfigurationsPerAgent.get(agent.id) ?? [];

      actions.push(...retrievalActionsConfigurations);

      // Dust app run configurations.
      const dustAppRunActionsConfigurations =
        dustAppRunActionsConfigurationsPerAgent.get(agent.id) ?? [];

      actions.push(...dustAppRunActionsConfigurations);

      // Websearch configurations.
      const websearchActionsConfigurations =
        websearchActionsConfigurationsPerAgent.get(agent.id) ?? [];

      actions.push(...websearchActionsConfigurations);

      // Browse configurations.
      const browseActionsConfigurations =
        browseActionsConfigurationsPerAgent.get(agent.id) ?? [];

      actions.push(...browseActionsConfigurations);

      // Table query configurations.
      const tableQueryActionsConfigurations =
        tableQueryActionsConfigurationsPerAgent.get(agent.id) ?? [];

      actions.push(...tableQueryActionsConfigurations);

      // Process configurations.
      const processActionConfigurations =
        processActionsConfigurationsPerAgent.get(agent.id) ?? [];

      actions.push(...processActionConfigurations);
    }

    let template: TemplateResource | null = null;
    if (agent.templateId) {
      template = await TemplateResource.fetchByModelId(agent.templateId);
    }

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
      model: {
        providerId: agent.providerId,
        modelId: agent.modelId,
        temperature: agent.temperature,
      },
      status: agent.status,
      actions,
      versionAuthorId: agent.authorId,
      maxStepsPerRun: agent.maxStepsPerRun,
      visualizationEnabled: agent.visualizationEnabled ?? false,
      templateId: template?.sId ?? null,
      groupIds: agent.groupIds.map((id) =>
        GroupResource.modelIdToSId({ id, workspaceId: owner.id })
      ),
      requestedGroupIds: agent.requestedGroupIds.map((groups) =>
        groups.map((id) =>
          GroupResource.modelIdToSId({ id, workspaceId: owner.id })
        )
      ),
    };

    agentConfigurationTypes.push(agentConfigurationType);
  }

  return agentConfigurationTypes;
}

export async function getAgentConfigurations<V extends "light" | "full">({
  auth,
  agentsGetView,
  agentPrefix,
  variant,
  limit,
  sort,
  dangerouslySkipPermissionFiltering,
}: {
  auth: Authenticator;
  agentsGetView: AgentsGetViewType;
  agentPrefix?: string;
  variant: V;
  limit?: number;
  sort?: SortStrategyType;
  dangerouslySkipPermissionFiltering?: boolean;
}): Promise<
  V extends "light" ? LightAgentConfigurationType[] : AgentConfigurationType[]
> {
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

  if (agentsGetView === "archived" && !auth.isDustSuperUser()) {
    throw new Error("Archived view is for dust superusers only.");
  }

  if (agentsGetView === "list" && !user) {
    throw new Error(
      "`list` or `assistants-search` view is specific to a user."
    );
  }

  const applySortAndLimit = makeApplySortAndLimit(sort, limit);

  if (agentsGetView === "global") {
    const allGlobalAgents = await fetchGlobalAgentConfigurationForView(auth, {
      agentPrefix,
      agentsGetView,
    });

    return applySortAndLimit(allGlobalAgents);
  }

  const allAgentConfigurations = await Promise.all([
    fetchGlobalAgentConfigurationForView(auth, {
      agentPrefix,
      agentsGetView,
    }),
    fetchWorkspaceAgentConfigurationsForView(auth, owner, {
      agentPrefix,
      agentsGetView,
      limit,
      sort,
      variant,
    }),
  ]);

  // Filter out agents that the user does not have access to
  // user should be in all groups that are in the agent's groupIds
  const allowedAgentConfigurations = dangerouslySkipPermissionFiltering
    ? allAgentConfigurations
    : allAgentConfigurations
        .flat()
        .filter((a) =>
          auth.canRead(
            Authenticator.createResourcePermissionsFromGroupIds(
              a.requestedGroupIds
            )
          )
        );

  return applySortAndLimit(allowedAgentConfigurations.flat());
}

/**
 *  Return names of all agents in the workspace, to avoid name collisions.
 */
export async function getAgentNames(auth: Authenticator): Promise<string[]> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Unexpected `auth` without `workspace`.");
  }
  if (!auth.isUser()) {
    throw new Error("Unexpected `auth` from outside workspace.");
  }

  const agents = await AgentConfiguration.findAll({
    where: {
      workspaceId: owner.id,
      status: "active",
    },
    attributes: ["name"],
  });

  return agents.map((a) => a.name);
}

async function isSelfHostedImageWithValidContentType(pictureUrl: string) {
  // Accept static Dust avatars.
  if (pictureUrl.startsWith("https://dust.tt/static/")) {
    return true;
  }

  const filename = pictureUrl.split("/").at(-1);
  if (!filename) {
    return false;
  }

  // Attempt to decode the URL, since Google Cloud Storage URL encodes the filename.
  const contentType = await getPublicUploadBucket().getFileContentType(
    decodeURIComponent(filename)
  );
  if (!contentType) {
    return false;
  }

  return contentType.includes("image");
}

export async function createAgentConfiguration(
  auth: Authenticator,
  {
    name,
    description,
    instructions,
    maxStepsPerRun,
    visualizationEnabled,
    pictureUrl,
    status,
    scope,
    model,
    agentConfigurationId,
    templateId,
    // TODO(2024-11-04 flav) `groupIds` clean up.
    groupIds,
    requestedGroupIds,
  }: {
    name: string;
    description: string;
    instructions: string | null;
    maxStepsPerRun: number;
    visualizationEnabled: boolean;
    pictureUrl: string;
    status: AgentStatus;
    scope: Exclude<AgentConfigurationScope, "global">;
    model: AgentModelConfigurationType;
    agentConfigurationId?: string;
    templateId: string | null;
    // TODO(2024-11-04 flav) `groupIds` clean up.
    groupIds: number[];
    requestedGroupIds: number[][];
  }
): Promise<Result<LightAgentConfigurationType, Error>> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Unexpected `auth` without `workspace`.");
  }

  const user = auth.user();
  if (!user) {
    throw new Error("Unexpected `auth` without `user`.");
  }

  if (maxStepsPerRun < 0 || maxStepsPerRun > MAX_STEPS_USE_PER_RUN_LIMIT) {
    return new Err(new Error("maxStepsPerRun must be between 0 and 8."));
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
    const agent = await frontSequelize.transaction(
      async (t): Promise<AgentConfiguration> => {
        if (agentConfigurationId) {
          const [existing, userRelation] = await Promise.all([
            AgentConfiguration.findOne({
              where: {
                sId: agentConfigurationId,
                workspaceId: owner.id,
              },
              attributes: ["scope", "version"],
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

          if (existing) {
            // Bump the version of the agent.
            version = existing.version + 1;
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

        const sId = agentConfigurationId || generateLegacyModelSId();

        // Create Agent config.
        return AgentConfiguration.create(
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
            maxStepsPerRun,
            visualizationEnabled,
            pictureUrl,
            workspaceId: owner.id,
            authorId: user.id,
            templateId: template?.id,
            groupIds,
            requestedGroupIds,
          },
          {
            transaction: t,
          }
        );
      }
    );

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
      },
      pictureUrl: agent.pictureUrl,
      status: agent.status,
      maxStepsPerRun: agent.maxStepsPerRun,
      visualizationEnabled: agent.visualizationEnabled ?? false,
      templateId: template?.sId ?? null,
      // TODO(2024-11-04 flav) `groupIds` clean up.
      groupIds: agent.groupIds.map((id) =>
        GroupResource.modelIdToSId({ id, workspaceId: owner.id })
      ),
      requestedGroupIds: agent.requestedGroupIds.map((groups) =>
        groups.map((id) =>
          GroupResource.modelIdToSId({ id, workspaceId: owner.id })
        )
      ),
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

/**
 * Create Agent RetrievalConfiguration
 */
export async function createAgentActionConfiguration(
  auth: Authenticator,
  action: (
    | {
        type: "retrieval_configuration";
        query: RetrievalQuery;
        relativeTimeFrame: RetrievalTimeframe;
        topK: number | "auto";
        dataSources: DataSourceConfiguration[];
      }
    | {
        type: "dust_app_run_configuration";
        appWorkspaceId: string;
        appId: string;
        app: AppType;
      }
    | {
        type: "tables_query_configuration";
        tables: TableDataSourceConfiguration[];
      }
    | {
        type: "process_configuration";
        relativeTimeFrame: RetrievalTimeframe;
        tagsFilter: ProcessTagsFilter | null;
        dataSources: DataSourceConfiguration[];
        schema: ProcessSchemaPropertyType[];
      }
    | {
        type: "websearch_configuration";
      }
    | {
        type: "browse_configuration";
      }
  ) & {
    name: string | null;
    description: string | null;
  },
  agentConfiguration: LightAgentConfigurationType
): Promise<Result<AgentActionConfigurationType, Error>> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Unexpected `auth` without `workspace`.");
  }

  switch (action.type) {
    case "retrieval_configuration": {
      return frontSequelize.transaction(async (t) => {
        const retrievalConfig = await AgentRetrievalConfiguration.create(
          {
            sId: generateLegacyModelSId(),
            query: action.query,
            relativeTimeFrame: isTimeFrame(action.relativeTimeFrame)
              ? "custom"
              : action.relativeTimeFrame,
            relativeTimeFrameDuration: isTimeFrame(action.relativeTimeFrame)
              ? action.relativeTimeFrame.duration
              : null,
            relativeTimeFrameUnit: isTimeFrame(action.relativeTimeFrame)
              ? action.relativeTimeFrame.unit
              : null,
            topK: action.topK !== "auto" ? action.topK : null,
            topKMode: action.topK === "auto" ? "auto" : "custom",
            agentConfigurationId: agentConfiguration.id,
            name: action.name,
            description: action.description,
          },
          { transaction: t }
        );
        await _createAgentDataSourcesConfigData(auth, t, {
          dataSourceConfigurations: action.dataSources,
          retrievalConfigurationId: retrievalConfig.id,
          processConfigurationId: null,
        });

        return new Ok({
          id: retrievalConfig.id,
          sId: retrievalConfig.sId,
          type: "retrieval_configuration",
          query: action.query,
          relativeTimeFrame: action.relativeTimeFrame,
          topK: action.topK,
          dataSources: action.dataSources,
          name: action.name || DEFAULT_RETRIEVAL_ACTION_NAME,
          description: action.description,
        });
      });
    }
    case "dust_app_run_configuration": {
      const dustAppRunConfig = await AgentDustAppRunConfiguration.create({
        sId: generateLegacyModelSId(),
        appWorkspaceId: action.appWorkspaceId,
        appId: action.appId,
        agentConfigurationId: agentConfiguration.id,
      });

      return new Ok({
        id: dustAppRunConfig.id,
        sId: dustAppRunConfig.sId,
        type: "dust_app_run_configuration",
        appWorkspaceId: action.appWorkspaceId,
        appId: action.appId,
        name: action.app.name,
        description: action.app.description,
      });
    }
    case "tables_query_configuration": {
      return frontSequelize.transaction(async (t) => {
        const tablesQueryConfig = await AgentTablesQueryConfiguration.create(
          {
            sId: generateLegacyModelSId(),
            agentConfigurationId: agentConfiguration.id,
            name: action.name,
            description: action.description,
          },
          { transaction: t }
        );

        await createTableDataSourceConfiguration(
          auth,
          action.tables,
          tablesQueryConfig,
          t
        );

        return new Ok({
          id: tablesQueryConfig.id,
          sId: tablesQueryConfig.sId,
          type: "tables_query_configuration",
          tables: action.tables,
          name: action.name || DEFAULT_TABLES_QUERY_ACTION_NAME,
          description: action.description,
        });
      });
    }
    case "process_configuration": {
      return frontSequelize.transaction(async (t) => {
        const processConfig = await AgentProcessConfiguration.create(
          {
            sId: generateLegacyModelSId(),
            relativeTimeFrame: isTimeFrame(action.relativeTimeFrame)
              ? "custom"
              : action.relativeTimeFrame,
            relativeTimeFrameDuration: isTimeFrame(action.relativeTimeFrame)
              ? action.relativeTimeFrame.duration
              : null,
            relativeTimeFrameUnit: isTimeFrame(action.relativeTimeFrame)
              ? action.relativeTimeFrame.unit
              : null,
            tagsIn: action.tagsFilter?.in ?? null,
            agentConfigurationId: agentConfiguration.id,
            schema: action.schema,
            name: action.name,
            description: action.description,
          },
          { transaction: t }
        );
        await _createAgentDataSourcesConfigData(auth, t, {
          dataSourceConfigurations: action.dataSources,
          retrievalConfigurationId: null,
          processConfigurationId: processConfig.id,
        });

        return new Ok({
          id: processConfig.id,
          sId: processConfig.sId,
          type: "process_configuration",
          relativeTimeFrame: action.relativeTimeFrame,
          tagsFilter: action.tagsFilter,
          schema: action.schema,
          dataSources: action.dataSources,
          name: action.name || DEFAULT_PROCESS_ACTION_NAME,
          description: action.description,
        });
      });
    }
    case "websearch_configuration": {
      const websearchConfig = await AgentWebsearchConfiguration.create({
        sId: generateLegacyModelSId(),
        agentConfigurationId: agentConfiguration.id,
        name: action.name,
        description: action.description,
      });

      return new Ok({
        id: websearchConfig.id,
        sId: websearchConfig.sId,
        type: "websearch_configuration",
        name: action.name || DEFAULT_WEBSEARCH_ACTION_NAME,
        description: action.description,
      });
    }
    case "browse_configuration": {
      const browseConfig = await AgentBrowseConfiguration.create({
        sId: generateLegacyModelSId(),
        agentConfigurationId: agentConfiguration.id,
        name: action.name,
        description: action.description,
      });

      return new Ok({
        id: browseConfig.id,
        sId: browseConfig.sId,
        type: "browse_configuration",
        name: action.name || DEFAULT_BROWSE_ACTION_NAME,
        description: action.description,
      });
    }
    default:
      assertNever(action);
  }
}

/**
 * Create the AgentDataSourceConfiguration rows in database.
 *
 * Knowing that a datasource is uniquely identified by its name and its workspaceId
 * We need to fetch the dataSources from the database from that.
 * We obvisously need to do as few queries as possible.
 */
async function _createAgentDataSourcesConfigData(
  auth: Authenticator,
  t: Transaction,
  {
    dataSourceConfigurations,
    retrievalConfigurationId,
    processConfigurationId,
  }: {
    dataSourceConfigurations: DataSourceConfiguration[];
    retrievalConfigurationId: ModelId | null;
    processConfigurationId: ModelId | null;
  }
): Promise<AgentDataSourceConfiguration[]> {
  // Although we have the capability to support multiple workspaces,
  // currently, we only support one workspace, which is the one the user is in.
  // This allows us to use the current authenticator to fetch resources.
  assert(
    dataSourceConfigurations.every(
      (dsc) => dsc.workspaceId === auth.getNonNullableWorkspace().sId
    )
  );

  // DataSourceViewResource.listByWorkspace() applies the permissions check.
  const dataSourceViews = await DataSourceViewResource.listByWorkspace(auth);
  const dataSourceViewsMap = dataSourceViews.reduce(
    (acc, dsv) => {
      acc[dsv.sId] = dsv;
      return acc;
    },
    {} as Record<string, DataSourceViewResource>
  );

  const agentDataSourcesConfigRows: AgentDataSourceConfiguration[] =
    await Promise.all(
      dataSourceConfigurations.map(async (dsConfig) => {
        const dataSourceView = dataSourceViewsMap[dsConfig.dataSourceViewId];
        assert(
          dataSourceView,
          "Can't create AgentDataSourceConfiguration for retrieval: DataSourceView not found."
        );

        return AgentDataSourceConfiguration.create(
          {
            dataSourceId: dataSourceView.dataSource.id,
            parentsIn: dsConfig.filter.parents?.in,
            parentsNotIn: dsConfig.filter.parents?.not,
            retrievalConfigurationId: retrievalConfigurationId,
            processConfigurationId: processConfigurationId,
            dataSourceViewId: dataSourceView.id,
          },
          { transaction: t }
        );
      })
    );

  return agentDataSourcesConfigRows;
}

export async function agentNameIsAvailable(
  auth: Authenticator,
  nameToCheck: string
) {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Unexpected `auth` without `workspace`.");
  }

  const agent = await AgentConfiguration.findOne({
    where: {
      workspaceId: owner.id,
      name: nameToCheck,
      status: "active",
    },
  });

  return !agent;
}

export async function setAgentScope(
  auth: Authenticator,
  agentId: string,
  scope: AgentConfigurationScope
): Promise<Result<{ agentId: string; scope: AgentConfigurationScope }, Error>> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Unexpected `auth` without `workspace`.");
  }

  if (scope === "global") {
    return new Err(new Error("Cannot set scope to global"));
  }

  const agent = await AgentConfiguration.findOne({
    where: {
      workspaceId: owner.id,
      sId: agentId,
      status: "active",
    },
  });

  if (!agent) {
    return new Err(new Error(`Could not find agent ${agentId}`));
  }

  if (agent.scope === scope) {
    return new Ok({ agentId, scope });
  }

  agent.scope = scope;
  await agent.save();

  return new Ok({ agentId, scope });
}

// Should only be called when we need to cleanup the agent configuration
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
