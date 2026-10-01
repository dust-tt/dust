import { listDefaultGlobalAgentIds } from "@app/lib/api/assistant/global_agents/global_agents";
import type { Authenticator } from "@app/lib/auth";
import { AgentResource } from "@app/lib/resources/agent_resource";
import type { AgentsGetViewType } from "@app/types/assistant/agent";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { removeNulls } from "@app/types/shared/utils/general";
import partition from "lodash/partition";

// Global agents first (in their default order), then custom agents by name, or by most recent
// version with `sort: "updatedAt"`; `sort: "alphabetical"` orders the whole list by name.
/**
 * @cc [owner:tdraier,label:security;product] agent-view-sets
 * Each view returns exactly these agents, filtered to the resources the caller can fetch:
 * - `list`/`manage`: active custom agents the caller can `read`; `list` adds the active global
 *   agents, `manage` every global agent.
 * - `all`: active visible custom agents the caller can `read`, plus the active global agents;
 *   `published`: the same custom agents, without global agents.
 * - `favorites`: the caller's active favorited agents they can `read`: custom ones, and global ones
 *   among the default global agents (`listDefaultGlobalAgentIds`), in their default order.
 * - `current_user`: active custom agents with a version the caller authored and can `read`.
 * - `archived`: archived custom agents, all of them for a workspace admin, else those the caller
 *   can `write`.
 * - `admin_internal`/`manage_unrestricted`/`analytics`: every active custom agent the caller can
 *   fetch; `manage_unrestricted` adds every global agent, the others the active ones.
 * - `global`: every global agent.
 * Every view MUST fail for a caller without a workspace role (`isUser`); `admin_internal` also
 * unless the caller is a superuser or an admin, `manage_unrestricted` unless an admin, and
 * `list`/`manage`/`favorites` without a user.
 */
/**
 * @cc [owner:philipperolet,label:backend] default-agent-query-order
 * Active-agent queries MUST default to name order when no sort is requested.
 */
export async function listAgentsForView(
  auth: Authenticator,
  view: AgentsGetViewType,
  {
    namePrefix,
    sort,
  }: { namePrefix?: string; sort?: "alphabetical" | "updatedAt" } = {}
): Promise<AgentResource[]> {
  assertViewAllowed(auth, view);

  const [globalAgents, viewAgents] = await Promise.all([
    listGlobalAgentsForView(auth, view),
    view === "global" ? [] : listViewAgents(auth, view),
  ]);
  const [favoriteGlobalAgents, customAgents] = partition(
    viewAgents,
    (agent) => agent.scope === "global"
  );
  const sortedCustomAgents =
    sort === "updatedAt"
      ? customAgents.toSorted(
          (a, b) => b.versionUpdatedAt.getTime() - a.versionUpdatedAt.getTime()
        )
      : customAgents.toSorted((a, b) => a.name.localeCompare(b.name));

  const lowerCasePrefix = namePrefix?.toLowerCase();
  const agents = [
    ...globalAgents,
    ...favoriteGlobalAgents,
    ...sortedCustomAgents,
  ].filter(
    (agent) =>
      !lowerCasePrefix || agent.name.toLowerCase().startsWith(lowerCasePrefix)
  );

  return sort === "alphabetical"
    ? agents.toSorted((a, b) => a.name.localeCompare(b.name))
    : agents;
}

function assertViewAllowed(auth: Authenticator, view: AgentsGetViewType): void {
  if (!auth.isUser()) {
    throw new Error("Unexpected `auth` without `workspace`.");
  }
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
      return (
        await AgentResource.listByWorkspace(auth, { scope: "visible" })
      ).filter(isReadable);
    case "favorites": {
      const [globalFavorites, customFavorites] = partition(
        (await AgentResource.listFavoritesForCurrentUser(auth)).filter(
          isActiveAndReadable
        ),
        (agent) => agent.scope === "global"
      );
      const globalFavoriteById = new Map(
        globalFavorites.map((agent) => [agent.sId, agent])
      );
      return [
        ...removeNulls(
          listDefaultGlobalAgentIds().map(
            (sId) => globalFavoriteById.get(sId) ?? null
          )
        ),
        ...customFavorites,
      ];
    }
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
