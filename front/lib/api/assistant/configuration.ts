import assert from "assert";
import type { Order, Transaction } from "sequelize";
import {
  Op,
  Sequelize,
  UniqueConstraintError,
  ValidationError,
} from "sequelize";

import { fetchBrowseActionConfigurations } from "@app/lib/actions/configuration/browse";
import { fetchDustAppRunActionConfigurations } from "@app/lib/actions/configuration/dust_app_run";
import { fetchMCPServerActionConfigurations } from "@app/lib/actions/configuration/mcp";
import { fetchAgentProcessActionConfigurations } from "@app/lib/actions/configuration/process";
import { fetchReasoningActionConfigurations } from "@app/lib/actions/configuration/reasoning";
import { fetchAgentRetrievalActionConfigurations } from "@app/lib/actions/configuration/retrieval";
import { fetchTableQueryActionConfigurations } from "@app/lib/actions/configuration/table_query";
import { fetchWebsearchActionConfigurations } from "@app/lib/actions/configuration/websearch";
import {
  DEFAULT_BROWSE_ACTION_NAME,
  DEFAULT_PROCESS_ACTION_NAME,
  DEFAULT_REASONING_ACTION_NAME,
  DEFAULT_RETRIEVAL_ACTION_NAME,
  DEFAULT_TABLES_QUERY_ACTION_NAME,
  DEFAULT_WEBSEARCH_ACTION_NAME,
} from "@app/lib/actions/constants";
import type { DataSourceConfiguration } from "@app/lib/actions/retrieval";
import type { TableDataSourceConfiguration } from "@app/lib/actions/tables_query";
import type {
  AgentActionConfigurationType,
  UnsavedAgentActionConfigurationType,
} from "@app/lib/actions/types/agent";
import { isPlatformMCPServerConfiguration } from "@app/lib/actions/types/guards";
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
import {
  AgentChildAgentConfiguration,
  AgentMCPServerConfiguration,
} from "@app/lib/models/assistant/actions/mcp";
import { AgentProcessConfiguration } from "@app/lib/models/assistant/actions/process";
import { AgentReasoningConfiguration } from "@app/lib/models/assistant/actions/reasoning";
import { AgentRetrievalConfiguration } from "@app/lib/models/assistant/actions/retrieval";
import {
  AgentTablesQueryConfiguration,
  AgentTablesQueryConfigurationTable,
} from "@app/lib/models/assistant/actions/tables_query";
import { AgentWebsearchConfiguration } from "@app/lib/models/assistant/actions/websearch";
import {
  AgentConfiguration,
  AgentUserRelation,
} from "@app/lib/models/assistant/agent";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import { TemplateResource } from "@app/lib/resources/template_resource";
import type {
  AgentConfigurationScope,
  AgentConfigurationType,
  AgentModelConfigurationType,
  AgentsGetViewType,
  AgentStatus,
  LightAgentConfigurationType,
  Result,
  WorkspaceType,
} from "@app/types";
import {
  assertNever,
  compareAgentsForSort,
  Err,
  isTimeFrame,
  MAX_STEPS_USE_PER_RUN_LIMIT,
  Ok,
  removeNulls,
} from "@app/types";

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
 */
export async function getAgentConfiguration<V extends "light" | "full">(
  auth: Authenticator,
  agentId: string,
  variant: V
): Promise<
  | (V extends "light" ? LightAgentConfigurationType : AgentConfigurationType)
  | null
> {
  const res = await getAgentConfigurations({
    auth,
    agentsGetView: { agentIds: [agentId] },
    variant,
  });
  // `as` is required here because the type collapses to `LightAgentConfigurationType |
  // AgentConfigurationType` as we access the first element of the array.
  return (
    (res[0] as V extends "light"
      ? LightAgentConfigurationType
      : AgentConfigurationType) || null
  );
}

/**
 * Search agent configurations by name
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
    case "current_user":
      return []; // fetch no global agents
    case "global":
    case "list":
    case "all":
    case "favorites":
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

  if (agentsGetView === "favorites") {
    const favoriteStates = await getFavoriteStates(auth, {
      configurationIds: matchingGlobalAgents.map((a) => a.sId),
    });
    return matchingGlobalAgents.filter(
      (a) => favoriteStates.get(a.sId) && a.status === "active"
    );
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
    case "current_user":
      const authorId = auth.getNonNullableUser().id;
      const r = await AgentConfiguration.findAll({
        attributes: ["sId"],
        group: "sId",
        where: {
          workspaceId: owner.id,
          authorId,
        },
      });

      return AgentConfiguration.findAll({
        ...baseAgentsSequelizeQuery,
        where: {
          ...baseWhereConditions,
          sId: { [Op.in]: [...new Set(r.map((r) => r.sId))] },
        },
      });
    case "archived":
      // Get the latest version of all archived agents.
      // For each sId, we want to fetch the one with the highest version, only if its status is "archived".
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

    case "favorites":
      const userId = auth.user()?.id;
      if (!userId) {
        return [];
      }
      const relations = await AgentUserRelation.findAll({
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

      return AgentConfiguration.findAll({
        ...baseAgentsSequelizeQuery,
        where: {
          ...baseWhereConditions,
          sId: { [Op.in]: sIds },
        },
      });
    default:
      if (typeof agentsGetView === "object" && "agentIds" in agentsGetView) {
        if (agentsGetView.allVersions) {
          return AgentConfiguration.findAll({
            where: {
              workspaceId: owner.id,
              sId: agentsGetView.agentIds.filter((id) => !isGlobalAgentId(id)),
            },
            order: [["version", "DESC"]],
          });
        }
        const latestVersions = (await AgentConfiguration.findAll({
          attributes: [
            "sId",
            [Sequelize.fn("MAX", Sequelize.col("version")), "max_version"],
          ],
          where: {
            workspaceId: owner.id,
            sId: agentsGetView.agentIds.filter((id) => !isGlobalAgentId(id)),
          },
          group: ["sId"],
          raw: true,
        })) as unknown as { sId: string; max_version: number }[];

        return AgentConfiguration.findAll({
          where: {
            workspaceId: owner.id,
            sId: latestVersions.map((v) => v.sId),
            version: {
              [Op.in]: latestVersions.map((v) => v.max_version),
            },
          },
          order: [["version", "DESC"]],
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
    reasoningActionsConfigurationsPerAgent,
    mcpServerActionsConfigurationsPerAgent,
    favoriteStatePerAgent,
  ] = await Promise.all([
    fetchAgentRetrievalActionConfigurations({ configurationIds, variant }),
    fetchAgentProcessActionConfigurations({ configurationIds, variant }),
    fetchDustAppRunActionConfigurations(auth, { configurationIds, variant }),
    fetchTableQueryActionConfigurations({ configurationIds, variant }),
    fetchWebsearchActionConfigurations({ configurationIds, variant }),
    fetchBrowseActionConfigurations({ configurationIds, variant }),
    fetchReasoningActionConfigurations({ configurationIds, variant }),
    fetchMCPServerActionConfigurations(auth, { configurationIds, variant }),
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
      const processActionsConfigurations =
        processActionsConfigurationsPerAgent.get(agent.id) ?? [];
      actions.push(...processActionsConfigurations);

      // Reasoning configurations
      const reasoningActionsConfigurations =
        reasoningActionsConfigurationsPerAgent.get(agent.id) ?? [];
      actions.push(...reasoningActionsConfigurations);

      // MCP server configurations
      const mcpServerActionsConfigurations =
        mcpServerActionsConfigurationsPerAgent.get(agent.id) ?? [];
      actions.push(...mcpServerActionsConfigurations);
    }

    const model: (typeof agentConfigurationType)["model"] = {
      providerId: agent.providerId,
      modelId: agent.modelId,
      temperature: agent.temperature,
    };

    if (agent.responseFormat) {
      model.responseFormat = agent.responseFormat;
    }

    if (agent.reasoningEffort) {
      model.reasoningEffort = agent.reasoningEffort;
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
      model,
      status: agent.status,
      actions,
      versionAuthorId: agent.authorId,
      maxStepsPerRun: agent.maxStepsPerRun,
      visualizationEnabled: agent.visualizationEnabled ?? false,
      templateId: agent.templateId
        ? TemplateResource.modelIdToSId({ id: agent.templateId })
        : null,
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
  if (agentsGetView === "favorites" && !user) {
    throw new Error("`favorites` view is specific to a user.");
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

  // Filter out agents that the user does not have access to user should be in all groups that are
  // in the agent's groupIds
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
    return new Err(
      new Error(
        `maxStepsPerRun must be between 0 and ${MAX_STEPS_USE_PER_RUN_LIMIT}.`
      )
    );
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

        const sId = agentConfigurationId || generateRandomModelSId();

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
            reasoningEffort: model.reasoningEffort,
            maxStepsPerRun,
            visualizationEnabled,
            pictureUrl,
            workspaceId: owner.id,
            authorId: user.id,
            templateId: template?.id,
            requestedGroupIds,
            responseFormat: model.responseFormat,
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

/**
 * Called by Agent Builder to create an action configuration.
 */
export async function createAgentActionConfiguration(
  auth: Authenticator,
  action: UnsavedAgentActionConfigurationType,
  agentConfiguration: LightAgentConfigurationType
): Promise<Result<AgentActionConfigurationType, Error>> {
  const owner = auth.getNonNullableWorkspace();

  switch (action.type) {
    case "retrieval_configuration": {
      return frontSequelize.transaction(async (t) => {
        const retrievalConfig = await AgentRetrievalConfiguration.create(
          {
            sId: generateRandomModelSId(),
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
            workspaceId: owner.id,
          },
          { transaction: t }
        );
        await createAgentDataSourcesConfiguration(auth, t, {
          dataSourceConfigurations: action.dataSources,
          retrievalConfiguration: retrievalConfig,
          processConfiguration: null,
          mcpServerConfiguration: null,
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
        sId: generateRandomModelSId(),
        appWorkspaceId: action.appWorkspaceId,
        appId: action.appId,
        agentConfigurationId: agentConfiguration.id,
        workspaceId: owner.id,
      });

      return new Ok({
        id: dustAppRunConfig.id,
        sId: dustAppRunConfig.sId,
        type: "dust_app_run_configuration",
        appWorkspaceId: action.appWorkspaceId,
        appId: action.appId,
        name: action.name,
        description: action.description,
      });
    }
    case "tables_query_configuration": {
      return frontSequelize.transaction(async (t) => {
        const tablesQueryConfig = await AgentTablesQueryConfiguration.create(
          {
            sId: generateRandomModelSId(),
            agentConfigurationId: agentConfiguration.id,
            name: action.name,
            description: action.description,
            workspaceId: owner.id,
          },
          { transaction: t }
        );

        await createTableDataSourceConfiguration(auth, t, {
          tableConfigurations: action.tables,
          tablesQueryConfig,
          mcpConfig: null,
        });

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
            sId: generateRandomModelSId(),
            relativeTimeFrame: isTimeFrame(action.relativeTimeFrame)
              ? "custom"
              : action.relativeTimeFrame,
            relativeTimeFrameDuration: isTimeFrame(action.relativeTimeFrame)
              ? action.relativeTimeFrame.duration
              : null,
            relativeTimeFrameUnit: isTimeFrame(action.relativeTimeFrame)
              ? action.relativeTimeFrame.unit
              : null,
            agentConfigurationId: agentConfiguration.id,
            schema: action.schema,
            name: action.name,
            description: action.description,
            workspaceId: owner.id,
          },
          { transaction: t }
        );
        await createAgentDataSourcesConfiguration(auth, t, {
          dataSourceConfigurations: action.dataSources,
          retrievalConfiguration: null,
          processConfiguration: processConfig,
          mcpServerConfiguration: null,
        });

        return new Ok({
          id: processConfig.id,
          sId: processConfig.sId,
          type: "process_configuration",
          relativeTimeFrame: action.relativeTimeFrame,
          schema: action.schema,
          dataSources: action.dataSources,
          name: action.name || DEFAULT_PROCESS_ACTION_NAME,
          description: action.description,
        });
      });
    }
    case "websearch_configuration": {
      const websearchConfig = await AgentWebsearchConfiguration.create({
        sId: generateRandomModelSId(),
        agentConfigurationId: agentConfiguration.id,
        name: action.name,
        description: action.description,
        workspaceId: owner.id,
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
        sId: generateRandomModelSId(),
        agentConfigurationId: agentConfiguration.id,
        name: action.name,
        description: action.description,
        workspaceId: owner.id,
      });

      return new Ok({
        id: browseConfig.id,
        sId: browseConfig.sId,
        type: "browse_configuration",
        name: action.name || DEFAULT_BROWSE_ACTION_NAME,
        description: action.description,
      });
    }
    case "reasoning_configuration": {
      const reasoningConfig = await AgentReasoningConfiguration.create({
        sId: generateRandomModelSId(),
        agentConfigurationId: agentConfiguration.id,
        name: action.name,
        description: action.description,
        providerId: action.providerId,
        modelId: action.modelId,
        temperature: action.temperature,
        reasoningEffort: action.reasoningEffort,
        workspaceId: owner.id,
      });

      return new Ok({
        id: reasoningConfig.id,
        sId: reasoningConfig.sId,
        type: "reasoning_configuration",
        providerId: action.providerId,
        modelId: action.modelId,
        temperature: action.temperature,
        reasoningEffort: action.reasoningEffort,
        name: action.name || DEFAULT_REASONING_ACTION_NAME,
        description: action.description,
      });
    }
    case "mcp_server_configuration": {
      assert(isPlatformMCPServerConfiguration(action));

      return frontSequelize.transaction(async (t) => {
        const mcpServerView = await MCPServerViewResource.fetchById(
          auth,
          action.mcpServerViewId
        );
        if (mcpServerView.isErr()) {
          return new Err(mcpServerView.error);
        }

        const mcpConfig = await AgentMCPServerConfiguration.create(
          {
            sId: generateRandomModelSId(),
            agentConfigurationId: agentConfiguration.id,
            workspaceId: owner.id,
            mcpServerViewId: mcpServerView.value.id,
          },
          { transaction: t }
        );

        // Creating the AgentDataSourceConfiguration if configured
        if (action.dataSources) {
          await createAgentDataSourcesConfiguration(auth, t, {
            dataSourceConfigurations: action.dataSources,
            retrievalConfiguration: null,
            processConfiguration: null,
            mcpServerConfiguration: mcpConfig,
          });
        }
        // Creating the AgentTablesQueryConfigurationTable if configured
        if (action.tables) {
          await createTableDataSourceConfiguration(auth, t, {
            tableConfigurations: action.tables,
            tablesQueryConfig: null,
            mcpConfig,
          });
        }
        // Creating the ChildAgentConfiguration if configured
        if (action.childAgentId) {
          await createChildAgentConfiguration(auth, t, {
            childAgentId: action.childAgentId,
            mcpConfig,
          });
        }

        return new Ok({
          id: mcpConfig.id,
          sId: mcpConfig.sId,
          type: "mcp_server_configuration",
          name: action.name,
          description: action.description,
          mcpServerViewId: action.mcpServerViewId,
          dataSources: action.dataSources,
          tables: action.tables,
          childAgentId: action.childAgentId,
        });
      });
    }
    default:
      assertNever(action);
  }
}

/**
 * Create the AgentDataSourceConfiguration rows in the database.
 *
 * Knowing that a datasource is uniquely identified by its name and its workspaceId
 * We need to fetch the dataSources from the database from that.
 * We obviously need to do as few queries as possible.
 */
async function createAgentDataSourcesConfiguration(
  auth: Authenticator,
  t: Transaction,
  {
    dataSourceConfigurations,
    retrievalConfiguration,
    processConfiguration,
    mcpServerConfiguration,
  }: {
    dataSourceConfigurations: DataSourceConfiguration[];
    retrievalConfiguration: AgentRetrievalConfiguration | null;
    processConfiguration: AgentProcessConfiguration | null;
    mcpServerConfiguration: AgentMCPServerConfiguration | null;
  }
): Promise<AgentDataSourceConfiguration[]> {
  const owner = auth.getNonNullableWorkspace();

  // Although we have the capability to support multiple workspaces,
  // currently, we only support one workspace, which is the one the user is in.
  // This allows us to use the current authenticator to fetch resources.
  assert(
    dataSourceConfigurations.every((dsc) => dsc.workspaceId === owner.sId)
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

  const agentDataSourceConfigBlobs = dataSourceConfigurations.map(
    (dsConfig) => {
      const dataSourceView = dataSourceViewsMap[dsConfig.dataSourceViewId];
      assert(
        dataSourceView,
        "Can't create AgentDataSourceConfiguration for retrieval: DataSourceView not found."
      );

      const tagsFilter = dsConfig.filter.tags;
      let tagsMode: "auto" | "custom" | null = null;
      let tagsIn: string[] | null = null;
      let tagsNotIn: string[] | null = null;

      if (tagsFilter?.mode === "auto") {
        tagsMode = "auto";
        tagsIn = tagsFilter.in ?? [];
        tagsNotIn = tagsFilter.not ?? [];
      } else if (tagsFilter?.mode === "custom") {
        tagsMode = "custom";
        tagsIn = tagsFilter.in ?? [];
        tagsNotIn = tagsFilter.not ?? [];
      }

      return {
        dataSourceId: dataSourceView.dataSource.id,
        parentsIn: dsConfig.filter.parents?.in,
        parentsNotIn: dsConfig.filter.parents?.not,
        retrievalConfigurationId: retrievalConfiguration?.id || null,
        processConfigurationId: processConfiguration?.id || null,
        dataSourceViewId: dataSourceView.id,
        mcpServerConfigurationId: mcpServerConfiguration?.id || null,
        tagsMode,
        tagsIn,
        tagsNotIn,
        workspaceId: owner.id,
      };
    }
  );

  return AgentDataSourceConfiguration.bulkCreate(agentDataSourceConfigBlobs, {
    transaction: t,
  });
}

async function createTableDataSourceConfiguration(
  auth: Authenticator,
  t: Transaction,
  {
    tableConfigurations,
    tablesQueryConfig,
    mcpConfig,
  }: {
    tableConfigurations: TableDataSourceConfiguration[];
    tablesQueryConfig: AgentTablesQueryConfiguration | null;
    mcpConfig: AgentMCPServerConfiguration | null;
  }
) {
  const owner = auth.getNonNullableWorkspace();
  // Although we have the capability to support multiple workspaces,
  // currently, we only support one workspace, which is the one the user is in.
  // This allows us to use the current authenticator to fetch resources.
  assert(tableConfigurations.every((tc) => tc.workspaceId === owner.sId));

  // DataSourceViewResource.listByWorkspace() applies the permissions check.
  const dataSourceViews = await DataSourceViewResource.listByWorkspace(auth);
  const dataSourceViewsMap = dataSourceViews.reduce(
    (acc, dsv) => {
      acc[dsv.sId] = dsv;
      return acc;
    },
    {} as Record<string, DataSourceViewResource>
  );

  const tableConfigBlobs = tableConfigurations.map((tc) => {
    const dataSourceView = dataSourceViewsMap[tc.dataSourceViewId];
    assert(
      dataSourceView,
      "Can't create TableDataSourceConfiguration for query tables: DataSourceView not found."
    );

    const { dataSource } = dataSourceView;

    return {
      dataSourceId: dataSource.id,
      dataSourceViewId: dataSourceView.id,
      tableId: tc.tableId,
      tablesQueryConfigurationId: tablesQueryConfig?.id || null,
      mcpServerConfigurationId: mcpConfig?.id || null,
      workspaceId: owner.id,
    };
  });

  return AgentTablesQueryConfigurationTable.bulkCreate(tableConfigBlobs, {
    transaction: t,
  });
}

async function createChildAgentConfiguration(
  auth: Authenticator,
  t: Transaction,
  {
    childAgentId,
    mcpConfig,
  }: {
    childAgentId: string;
    mcpConfig: AgentMCPServerConfiguration;
  }
) {
  return AgentChildAgentConfiguration.create(
    {
      agentConfigurationId: childAgentId,
      mcpServerConfigurationId: mcpConfig.id,
      workspaceId: auth.getNonNullableWorkspace().id,
    },
    { transaction: t }
  );
}

export async function getAgentSIdFromName(
  auth: Authenticator,
  name: string
): Promise<string | null> {
  const owner = auth.getNonNullableWorkspace();

  const agent = await AgentConfiguration.findOne({
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

export async function agentNameIsAvailable(
  auth: Authenticator,
  nameToCheck: string
) {
  const sId = await getAgentSIdFromName(auth, nameToCheck);
  return !sId;
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
