import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { workspaceAdminGuard } from "@app/lib/actions/mcp_internal_actions/utils";
import type { AgentViewType } from "@app/lib/api/actions/servers/workspace_management/metadata";
import {
  makeTextLines,
  paginate,
  renderFields,
  renderPageFooter,
} from "@app/lib/api/actions/servers/workspace_management/tools/utils";
import { listAgentsForView } from "@app/lib/api/assistant/agent_views";
import type { Authenticator } from "@app/lib/auth";
import { toLightAgentConfigurations } from "@app/lib/resources/agent_resource_serialization";
import type { AgentsGetViewType } from "@app/types/assistant/agent";
import { Err, Ok } from "@app/types/shared/result";

function resolveAgentView(view: AgentViewType): {
  agentsGetView: AgentsGetViewType;
} {
  // `all_unrestricted` maps onto `admin_internal`, which lists every agent the admin can fetch
  // (all of them), exactly like the public agent_configurations endpoint does.
  if (view === "all_unrestricted") {
    return {
      agentsGetView: "admin_internal",
    };
  }

  // Every other view is an `AgentsGetViewType` already, which `PASS_THROUGH_AGENT_VIEWS` proves,
  // so it needs no mapping and no extra guard — `archived` included, since that view self-scopes
  // to the agents the caller edits, or all of them for an admin.
  return {
    agentsGetView: view,
  };
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
    view?: AgentViewType;
    namePrefix?: string;
    cursor?: number;
    limit?: number;
  },
  { auth }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  // Default to `list` so the caller's own unpublished agents are found on the first call;
  // `list` needs a user, so non-interactive callers fall back to `all`.
  view ??= auth.user() ? "list" : "all";

  const viewDenied = guardAgentView(auth, view);
  if (viewDenied) {
    return new Err(viewDenied);
  }

  const { agentsGetView } = resolveAgentView(view);

  // `limit` stays out of the fetch on purpose: it has no offset counterpart, and the view
  // applies it in SQL before the requested-space filtering, so a page would silently come
  // back short. Paginate the sorted set here instead, which also keeps `total` exact.
  const agents = await toLightAgentConfigurations(
    auth,
    await listAgentsForView(auth, agentsGetView, {
      namePrefix,
      sort: "alphabetical",
    }),
    { withInstructions: false }
  );

  const paginated = paginate(agents, { cursor, limit });
  if (paginated.isErr()) {
    return new Err(paginated.error);
  }
  const { page, total, nextCursor } = paginated.value;

  if (total === 0) {
    return new Ok([
      { type: "text" as const, text: `No agents found for view '${view}'.` },
    ]);
  }

  return new Ok([
    makeTextLines([
      ...page.map((agent) =>
        [
          `${agent.name} [${agent.sId}]`,
          renderFields({
            scope: agent.scope,
            status: agent.status,
            model: agent.model.modelId,
            tags: agent.tags.map((tag) => tag.name).join("|") || null,
            updated: agent.versionCreatedAt,
            canEdit: agent.canEdit,
          }),
          agent.description,
        ]
          .filter(Boolean)
          .join(" — ")
      ),
      renderPageFooter({ shown: page.length, total, nextCursor }),
    ]),
  ]);
}
