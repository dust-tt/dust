import { filterAgentsByRequestedSpaces } from "@app/lib/api/assistant/configuration/agent";
import { enrichAgentConfigurations } from "@app/lib/api/assistant/configuration/helpers";
import type {
  SortStrategy,
  SortStrategyType,
} from "@app/lib/api/assistant/configuration/types";
import { getFavoriteStates } from "@app/lib/api/assistant/get_favorite_states";
import { getGlobalAgents } from "@app/lib/api/assistant/global_agents/global_agents";
import { shadowCompare } from "@app/lib/api/permissions/shadow";
import type { Authenticator } from "@app/lib/auth";
import {
  AgentConfigurationModel,
  AgentUserRelationModel,
} from "@app/lib/models/agent/agent";
import { GroupResource } from "@app/lib/resources/group_resource";
import type {
  AgentConfigurationType,
  AgentFetchVariant,
  AgentsGetViewType,
  LightAgentConfigurationType,
} from "@app/types/assistant/agent";
import { compareAgentsForSort } from "@app/types/assistant/assistant";
import type { ModelId } from "@app/types/shared/model_id";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { WorkspaceType } from "@app/types/user";
import { Op, Sequelize } from "sequelize";

const HEAVY_AGENT_CONFIGURATION_ATTRIBUTES = [
  "instructions",
  "instructionsHtml",
] as const;

type EditorFilter =
  | { kind: "all" }
  | { kind: "agent" | "configuration"; modelIds: ModelId[] };

function editorWhere(filter: EditorFilter) {
  // Configuration ids use the primary key; stable agent ids use the agentId index.
  switch (filter.kind) {
    case "all":
      return {};
    case "agent":
      return { agentId: { [Op.in]: filter.modelIds } };
    case "configuration":
      return { id: { [Op.in]: filter.modelIds } };
    default:
      return assertNever(filter);
  }
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

async function fetchGlobalAgentConfigurationForView(
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
  const globalAgentIdsToFetch = determineGlobalAgentIdsToFetch(agentsGetView);
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
      !agentPrefix || a.name.toLowerCase().startsWith(agentPrefix.toLowerCase())
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
    editorFilter,
    limit,
    owner,
    sort,
    omitHeavyAttributes,
  }: {
    agentPrefix?: string;
    agentsGetView: Exclude<AgentsGetViewType, "global">;
    editorFilter: EditorFilter;
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
        return AgentConfigurationModel.findAll({
          ...excludeAttributesFromSelect,
          where: {
            workspaceId: owner.id,
            [Op.and]: [editorWhere(editorFilter), { id: { [Op.in]: maxIds } }],
            status: "archived",
            ...(agentPrefix ? { name: { [Op.iLike]: `${agentPrefix}%` } } : {}),
          },
        });
      });

    case "all":
      return AgentConfigurationModel.findAll({
        ...baseAgentsSequelizeQuery,
        where: baseConditionsAndScopesIn(["workspace", "published", "visible"]),
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
                  { ...editorWhere(editorFilter), scope: "hidden" },
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

type ShadowAgentViewArgs = {
  auth: Authenticator;
  owner: WorkspaceType;
  view: "list" | "manage" | "archived";
  legacyModels: AgentConfigurationModel[];
  skipPermissionFiltering: boolean;
  agentPrefix?: string;
  limit?: number;
  sort?: SortStrategyType;
  omitHeavyAttributes?: boolean;
};

async function shadowAgentView({
  auth,
  owner,
  view,
  legacyModels,
  skipPermissionFiltering,
  agentPrefix,
  limit,
  sort,
  omitHeavyAttributes,
}: ShadowAgentViewArgs): Promise<void> {
  const stableAgentModelIds = (models: AgentConfigurationModel[]) =>
    [...new Set(models.map((model) => model.agentId))].sort((a, b) => a - b);

  await shadowCompare({
    auth,
    legacy: stableAgentModelIds(legacyModels),
    candidate: async () => {
      const grantResources = auth.getResourceIdsWithVerb("agent", "write");
      const editorFilter: EditorFilter =
        auth.isAdmin() && view === "archived"
          ? { kind: "all" }
          : grantResources.kind === "all"
            ? { kind: "all" }
            : { kind: "agent", modelIds: grantResources.resourceIds };
      const candidateModels =
        await fetchWorkspaceAgentConfigurationsWithoutActions(auth, {
          agentPrefix,
          agentsGetView: view,
          editorFilter,
          limit,
          owner,
          sort,
          omitHeavyAttributes,
        });
      const allowedCandidateModels = skipPermissionFiltering
        ? candidateModels
        : await filterAgentsByRequestedSpaces(auth, candidateModels);

      return stableAgentModelIds(allowedCandidateModels);
    },
    context: {
      check: "agent_view",
      view,
      workspaceId: owner.sId,
    },
    equals: (legacy, candidate) =>
      legacy.length === candidate.length &&
      legacy.every((agentModelId, index) => agentModelId === candidate[index]),
  });
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
  const legacyEditorFilter: EditorFilter = auth.isAdmin()
    ? { kind: "all" }
    : { kind: "configuration", modelIds: agentIdsForUserAsEditor };

  const agentModels = await fetchWorkspaceAgentConfigurationsWithoutActions(
    auth,
    {
      agentPrefix,
      agentsGetView,
      editorFilter:
        agentsGetView === "archived"
          ? legacyEditorFilter
          : { kind: "configuration", modelIds: agentIdsForUserAsEditor },
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
    : await filterAgentsByRequestedSpaces(auth, agentModels);

  if (
    agentsGetView === "list" ||
    agentsGetView === "manage" ||
    agentsGetView === "archived"
  ) {
    await shadowAgentView({
      auth,
      owner,
      view: agentsGetView,
      legacyModels: allowedAgentModels,
      skipPermissionFiltering,
      agentPrefix,
      limit,
      sort,
      omitHeavyAttributes,
    });
  }

  return enrichAgentConfigurations(auth, allowedAgentModels, {
    variant,
    agentIdsForUserAsEditor,
  });
}

type AgentConfigurationsForViewBaseArgs = {
  auth: Authenticator;
  agentsGetView: AgentsGetViewType;
  agentPrefix?: string;
  limit?: number;
  sort?: SortStrategyType;
  dangerouslySkipPermissionFiltering?: boolean;
};

type FullAgentConfigurationsForViewArgs = AgentConfigurationsForViewBaseArgs & {
  variant: "full";
  omitHeavyAttributes?: never;
};

type LightAgentConfigurationsForViewArgs =
  AgentConfigurationsForViewBaseArgs & {
    variant: Exclude<AgentFetchVariant, "full">;
    omitHeavyAttributes?: boolean;
  };

export function getAgentConfigurationsForView(
  args: FullAgentConfigurationsForViewArgs
): Promise<AgentConfigurationType[]>;
export function getAgentConfigurationsForView(
  args: LightAgentConfigurationsForViewArgs
): Promise<LightAgentConfigurationType[]>;
export async function getAgentConfigurationsForView({
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

  const applySortAndLimit = makeApplySortAndLimit(sort, limit);

  if (agentsGetView === "global") {
    const allGlobalAgents = await fetchGlobalAgentConfigurationForView(auth, {
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
    fetchGlobalAgentConfigurationForView(auth, {
      agentPrefix,
      agentsGetView,
      variant,
      omitHeavyAttributes,
    }),
    fetchWorkspaceAgentConfigurationsForView(auth, owner, {
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
