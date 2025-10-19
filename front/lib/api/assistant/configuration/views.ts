import { Op, Sequelize } from "sequelize";

import { enrichAgentConfigurations } from "@app/lib/api/assistant/configuration/helpers";
import type {
  SortStrategy,
  SortStrategyType,
} from "@app/lib/api/assistant/configuration/types";
import { getFavoriteStates } from "@app/lib/api/assistant/get_favorite_states";
import { getGlobalAgents } from "@app/lib/api/assistant/global_agents/global_agents";
import { Authenticator } from "@app/lib/auth";
import {
  AgentConfiguration,
  AgentUserRelation,
} from "@app/lib/models/assistant/agent";
import { GroupResource } from "@app/lib/resources/group_resource";
import type {
  AgentConfigurationType,
  AgentFetchVariant,
  AgentsGetViewType,
  LightAgentConfigurationType,
  ModelId,
  WorkspaceType,
} from "@app/types";
import { compareAgentsForSort } from "@app/types";
import { assertNever } from "@app/types";

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

function makeApplySortAndLimit(sort?: SortStrategyType, limit?: number) {
  return (results: AgentConfigurationType[]) => {
    const sortStrategy = sort && sortStrategies[sort];

    const sortedResults = sortStrategy
      ? results.sort(sortStrategy.compareFunction)
      : results;

    return limit ? sortedResults.slice(0, limit) : sortedResults;
  };
}

function determineGlobalAgentIdsToFetch(
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
    case "all":
    case "favorites":
    case "admin_internal":
      return undefined; // undefined means all global agents will be fetched
    default:
      assertNever(agentsGetView);
  }
}

async function fetchGlobalAgentConfigurationForView(
  auth: Authenticator,
  {
    agentPrefix,
    agentsGetView,
    variant,
  }: {
    agentPrefix?: string;
    agentsGetView: AgentsGetViewType;
    variant: AgentFetchVariant;
  }
) {
  const globalAgentIdsToFetch = determineGlobalAgentIdsToFetch(agentsGetView);
  const allGlobalAgents = await getGlobalAgents(
    auth,
    globalAgentIdsToFetch,
    variant
  );
  const matchingGlobalAgents = allGlobalAgents.filter(
    (a) =>
      !agentPrefix || a.name.toLowerCase().startsWith(agentPrefix.toLowerCase())
  );

  if (agentsGetView === "global" || agentsGetView === "manage") {
    // All global agents in global and manage views.
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

async function fetchWorkspaceAgentConfigurationsWithoutActions(
  auth: Authenticator,
  {
    agentPrefix,
    agentsGetView,
    agentIdsForUserAsEditor,
    limit,
    owner,
    sort,
  }: {
    agentPrefix?: string;
    agentsGetView: Exclude<AgentsGetViewType, "global">;
    agentIdsForUserAsEditor: ModelId[];
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
        const filteredIds = maxIds.filter(
          (id) => agentIdsForUserAsEditor.includes(id) || auth.isAdmin()
        );

        return AgentConfiguration.findAll({
          where: {
            id: {
              [Op.in]: filteredIds,
            },
            status: "archived",
          },
        });
      });

    case "all":
      return AgentConfiguration.findAll({
        ...baseAgentsSequelizeQuery,
        where: baseConditionsAndScopesIn(["workspace", "published", "visible"]),
      });

    case "published":
      return AgentConfiguration.findAll({
        ...baseAgentsSequelizeQuery,
        where: baseConditionsAndScopesIn(["published", "visible"]),
      });

    case "list":
    case "manage":
      const user = auth.user();
      return AgentConfiguration.findAll({
        ...baseAgentsSequelizeQuery,
        where: {
          ...baseWhereConditions,
          [Op.or]: [
            { scope: { [Op.in]: ["workspace", "published", "visible"] } },
            ...(user
              ? [
                  { authorId: user.id, scope: "private" },
                  { id: { [Op.in]: agentIdsForUserAsEditor }, scope: "hidden" },
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
    variant: AgentFetchVariant;
  }
) {
  const user = auth.user();

  const agentIdsForGroups = user
    ? await GroupResource.findAgentIdsForGroups(auth, [
        ...auth
          .groups()
          .filter((g) => g.kind === "agent_editors")
          .map((g) => g.id),
      ])
    : [];

  const agentIdsForUserAsEditor = agentIdsForGroups.map(
    (g) => g.agentConfigurationId
  );

  const agentConfigurations =
    await fetchWorkspaceAgentConfigurationsWithoutActions(auth, {
      agentPrefix,
      agentsGetView,
      agentIdsForUserAsEditor,
      limit,
      owner,
      sort,
    });

  return enrichAgentConfigurations(auth, agentConfigurations, {
    variant,
    agentIdsForUserAsEditor,
  });
}

export async function getAgentConfigurationsForView<
  V extends AgentFetchVariant,
>({
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
  V extends "full" ? AgentConfigurationType[] : LightAgentConfigurationType[]
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

  if (
    !user &&
    (agentsGetView === "list" ||
      agentsGetView === "manage" ||
      agentsGetView === "favorites")
  ) {
    throw new Error(`'${agentsGetView}' view is specific to a user.`);
  }

  const applySortAndLimit = makeApplySortAndLimit(sort, limit);

  if (agentsGetView === "global") {
    const allGlobalAgents = await fetchGlobalAgentConfigurationForView(auth, {
      agentPrefix,
      agentsGetView,
      variant,
    });

    return applySortAndLimit(allGlobalAgents);
  }

  const allAgentConfigurations = await Promise.all([
    fetchGlobalAgentConfigurationForView(auth, {
      agentPrefix,
      agentsGetView,
      variant,
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
    : allAgentConfigurations.flat().filter(
        (a) =>
          auth.canRead(
            auth.shouldUseRequestedSpaces()
              ? Authenticator.createResourcePermissionsFromSpaceIds(a.requestedSpaceIds)
              : Authenticator.createResourcePermissionsFromGroupIds(a.requestedGroupIds)
          )
      );

  return applySortAndLimit(allowedAgentConfigurations.flat());
}
