import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { workspaceAdminGuard } from "@app/lib/actions/mcp_internal_actions/utils";
import type { AgentViewType } from "@app/lib/api/actions/servers/workspace_management/metadata";
import {
  makeJsonText,
  paginate,
} from "@app/lib/api/actions/servers/workspace_management/tools/utils";
import { getAgentConfigurationsForView } from "@app/lib/api/assistant/configuration/views";
import type { Authenticator } from "@app/lib/auth";
import type { AgentsGetViewType } from "@app/types/assistant/agent";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";

// `all_unrestricted` maps onto `admin_internal` to lift the scope restriction (unpublished
// agents the caller does not edit) plus permission filtering to lift the space one, exactly like
// the public agent_configurations endpoint does.
function resolveAgentView(view: AgentViewType): {
  agentsGetView: AgentsGetViewType;
  dangerouslySkipPermissionFiltering: boolean;
} {
  switch (view) {
    case "all_unrestricted":
      return {
        agentsGetView: "admin_internal",
        dangerouslySkipPermissionFiltering: true,
      };
    case "all":
    case "list":
    case "published":
    case "global":
    // The archived view already scopes to the agents the caller edits, or all of them for an
    // admin, so it needs no extra guard.
    case "archived":
      return {
        agentsGetView: view,
        dangerouslySkipPermissionFiltering: false,
      };
    default:
      assertNever(view);
  }
}

function guardAgentView(
  auth: Authenticator,
  view: AgentViewType
): MCPError | null {
  if (view === "all_unrestricted") {
    return workspaceAdminGuard(auth);
  }
  // `list` filters on the caller's own agents, so it cannot run without one.
  if (view === "list" && !auth.user()) {
    return new MCPError(
      "The 'list' view requires an interactive user; use 'all' instead.",
      { tracked: false }
    );
  }
  return null;
}

export async function listAgents(
  {
    view,
    namePrefix,
    cursor,
    limit,
  }: {
    view: AgentViewType;
    namePrefix?: string;
    cursor?: number;
    limit?: number;
  },
  { auth }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  const viewDenied = guardAgentView(auth, view);
  if (viewDenied) {
    return new Err(viewDenied);
  }

  const { agentsGetView, dangerouslySkipPermissionFiltering } =
    resolveAgentView(view);

  // `limit` stays out of the fetch on purpose: it has no offset counterpart, and the view
  // applies it in SQL before the requested-space filtering, so a page would silently come
  // back short. Paginate the sorted set here instead, which also keeps `total` exact.
  const agents = await getAgentConfigurationsForView({
    auth,
    agentsGetView,
    agentPrefix: namePrefix,
    sort: "alphabetical",
    variant: "light",
    omitHeavyAttributes: true,
    dangerouslySkipPermissionFiltering,
  });

  const paginated = paginate(agents, { cursor, limit });
  if (paginated.isErr()) {
    return new Err(paginated.error);
  }
  const { page, total, nextCursor } = paginated.value;

  return new Ok([
    makeJsonText({
      total,
      nextCursor,
      view,
      agents: page.map((agent) => ({
        sId: agent.sId,
        name: agent.name,
        description: agent.description,
        scope: agent.scope,
        status: agent.status,
        model: agent.model.modelId,
        tags: agent.tags.map((tag) => tag.name),
        versionCreatedAt: agent.versionCreatedAt,
        canEdit: agent.canEdit,
      })),
    }),
  ]);
}
