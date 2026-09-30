import type { SortStrategyType } from "@app/lib/api/assistant/configuration/types";
import type { Authenticator } from "@app/lib/auth";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { toLightAgentConfigurations } from "@app/lib/resources/agent_resource_serialization";
import type {
  AgentFetchVariant,
  AgentsGetViewType,
  LightAgentConfigurationType,
} from "@app/types/assistant/agent";
import { compareAgentsForSort } from "@app/types/assistant/assistant";
import { assertNever } from "@app/types/shared/utils/assert_never";

function assertViewAllowed(auth: Authenticator, view: AgentsGetViewType) {
  if (view === "admin_internal" && !auth.isDustSuperUser() && !auth.isAdmin()) {
    throw new Error(
      "Superuser view is for dust superusers or internal admin auths only."
    );
  }

  if (view === "manage_unrestricted" && !auth.isAdmin()) {
    throw new Error("The unrestricted manage view is for admins only.");
  }

  if (
    !auth.user() &&
    (view === "list" || view === "manage" || view === "favorites")
  ) {
    throw new Error(`'${view}' view is specific to a user.`);
  }
}

async function listGlobalAgentsForView(
  auth: Authenticator,
  view: AgentsGetViewType
): Promise<AgentResource[]> {
  switch (view) {
    case "archived":
    case "published":
    case "current_user":
    case "favorites":
      return [];
    case "global":
    case "manage":
    case "manage_unrestricted":
      return AgentResource.listGlobalAgents(auth);
    case "list":
    case "all":
    case "analytics":
    case "admin_internal":
      return (await AgentResource.listGlobalAgents(auth)).filter(
        (agent) => agent.status === "active"
      );
    default:
      assertNever(view);
  }
}

// The custom agents of a view, and for `favorites` the favorited global agents too.
async function listViewAgents(
  auth: Authenticator,
  view: Exclude<AgentsGetViewType, "global">
): Promise<AgentResource[]> {
  const isReadable = (agent: AgentResource) => auth.can("read", agent);
  const isActiveAndReadable = (agent: AgentResource) =>
    agent.status === "active" && isReadable(agent);

  switch (view) {
    case "list":
    case "manage":
      return (await AgentResource.listByWorkspace(auth)).filter(isReadable);
    case "all":
    case "published":
      return (await AgentResource.listByWorkspace(auth)).filter(
        (agent) => agent.scope === "visible" && isReadable(agent)
      );
    case "favorites":
      return (await AgentResource.listFavoritesForCurrentUser(auth)).filter(
        isActiveAndReadable
      );
    case "current_user":
      return (
        await AgentResource.listByAuthor(auth, {
          authorModelId: auth.getNonNullableUser().id,
        })
      ).filter(isActiveAndReadable);
    case "archived":
      return (
        await AgentResource.listByWorkspace(auth, { status: "archived" })
      ).filter((agent) => auth.isAdmin() || auth.can("write", agent));
    case "admin_internal":
    case "manage_unrestricted":
    case "analytics":
      return AgentResource.listByWorkspace(auth);
    default:
      assertNever(view);
  }
}

/**
 * @cc [owner:tdraier,label:security;product] agent-view-sets
 * Each view returns exactly these agents, filtered to the resources the caller can fetch:
 * - `list`/`manage`: active custom agents the caller can `read`; `list` adds the active global
 *   agents, `manage` every global agent.
 * - `all`: active visible custom agents the caller can `read`, plus the active global agents;
 *   `published`: the same custom agents, without global agents.
 * - `favorites`: the caller's active favorited agents, global or custom, they can `read`.
 * - `current_user`: active custom agents with a version the caller authored and can `read`.
 * - `archived`: archived custom agents, all of them for a workspace admin, else those the caller
 *   can `write`.
 * - `admin_internal`/`manage_unrestricted`/`analytics`: every active custom agent the caller can
 *   fetch; `manage_unrestricted` adds every global agent, the others the active ones.
 * - `global`: every global agent.
 * `admin_internal` MUST fail unless the caller is a superuser or an admin, `manage_unrestricted`
 * unless an admin, and `list`/`manage`/`favorites` without a user.
 */
/**
 * @cc [owner:philipperolet,label:backend] default-agent-query-order
 * Active-agent queries MUST default to name order when no sort is requested.
 */
export async function listAgentsForView(
  auth: Authenticator,
  {
    agentsGetView,
    agentPrefix,
    sort,
  }: {
    agentsGetView: AgentsGetViewType;
    agentPrefix?: string;
    sort?: SortStrategyType;
  }
): Promise<AgentResource[]> {
  assertViewAllowed(auth, agentsGetView);

  const [globalAgents, viewAgents] = await Promise.all([
    listGlobalAgentsForView(auth, agentsGetView),
    agentsGetView === "global" ? [] : listViewAgents(auth, agentsGetView),
  ]);

  const [favoriteGlobalAgents, customAgents] = [
    viewAgents.filter((agent) => agent.scope === "global"),
    viewAgents.filter((agent) => agent.scope !== "global"),
  ];
  const sortedCustomAgents =
    sort === "updatedAt"
      ? customAgents.toSorted(
          (a, b) => b.versionUpdatedAt.getTime() - a.versionUpdatedAt.getTime()
        )
      : customAgents.toSorted((a, b) => a.name.localeCompare(b.name));

  const lowerCasePrefix = agentPrefix?.toLowerCase();
  return [
    ...globalAgents,
    ...favoriteGlobalAgents,
    ...sortedCustomAgents,
  ].filter(
    (agent) =>
      !lowerCasePrefix || agent.name.toLowerCase().startsWith(lowerCasePrefix)
  );
}

const inMemorySorts: Partial<
  Record<
    SortStrategyType,
    (a: LightAgentConfigurationType, b: LightAgentConfigurationType) => number
  >
> = {
  alphabetical: (a, b) => a.name.localeCompare(b.name),
  priority: compareAgentsForSort,
};

/**
 * Renders a view (see `listAgentsForView`) as light configurations, sorted and limited after the
 * permission filtering so a limit never drops a readable agent.
 */
export async function getAgentConfigurationsForView({
  auth,
  agentsGetView,
  agentPrefix,
  variant,
  limit,
  sort,
  omitHeavyAttributes,
}: {
  auth: Authenticator;
  agentsGetView: AgentsGetViewType;
  agentPrefix?: string;
  variant: Exclude<AgentFetchVariant, "full">;
  limit?: number;
  sort?: SortStrategyType;
  omitHeavyAttributes?: boolean;
}): Promise<LightAgentConfigurationType[]> {
  const agents = await listAgentsForView(auth, {
    agentsGetView,
    agentPrefix,
    sort,
  });

  const isExtraLight = variant === "extra_light";
  const configurations = await toLightAgentConfigurations(auth, agents, {
    withInstructions: !omitHeavyAttributes,
    withFavorites: !isExtraLight,
    withTags: !isExtraLight,
  });

  const compare = sort ? inMemorySorts[sort] : undefined;
  const sorted = compare ? configurations.sort(compare) : configurations;

  return limit ? sorted.slice(0, limit) : sorted;
}
