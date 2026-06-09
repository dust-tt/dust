import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { workspaceAdminGuard } from "@app/lib/actions/mcp_internal_actions/utils";
import { WORKSPACE_ANALYTICS_TOOLS_METADATA } from "@app/lib/api/actions/servers/workspace_analytics/metadata";
import { resolveTimeWindow } from "@app/lib/api/actions/servers/workspace_analytics/query_input";
import { fetchTopAgents } from "@app/lib/api/assistant/observability/top_agents";
import { fetchTopUsers } from "@app/lib/api/assistant/observability/top_users";
import { Err, Ok } from "@app/types/shared/result";

const DEFAULT_LIMIT = 25;

const handlers: ToolHandlers<typeof WORKSPACE_ANALYTICS_TOOLS_METADATA> = {
  get_top_agents: async (
    { limit, period, startDate, endDate, timezone, source, agentIds, userIds },
    { auth }
  ) => {
    const denied = workspaceAdminGuard(auth);
    if (denied) {
      return new Err(denied);
    }

    const window = resolveTimeWindow({ period, startDate, endDate, timezone });
    if (window.isErr()) {
      return new Err(new MCPError(window.error, { tracked: false }));
    }

    const result = await fetchTopAgents(auth, {
      startDate: window.value.startDate,
      endDate: window.value.endDate,
      limit: limit ?? DEFAULT_LIMIT,
      contextOrigin: source,
      agentIds,
      userIds,
    });

    if (result.isErr()) {
      return new Err(
        new MCPError(`Failed to retrieve top agents: ${result.error.message}`)
      );
    }

    const { label, timezone: tz } = window.value;

    if (result.value.length === 0) {
      return new Ok([
        {
          type: "text" as const,
          text: `No agent activity recorded for ${label} (${tz}).`,
        },
      ]);
    }

    const lines = result.value.map(
      (agent, index) =>
        `${index + 1}. ${agent.name} [${agent.agentId}] — ` +
        `${agent.messageCount} messages, ${agent.userCount} users`
    );

    return new Ok([
      {
        type: "text" as const,
        text:
          `Top agents for ${label} (${tz}), most used first:\n` +
          lines.join("\n"),
      },
    ]);
  },

  get_top_users: async (
    { limit, period, startDate, endDate, timezone, source, agentIds, userIds },
    { auth }
  ) => {
    const denied = workspaceAdminGuard(auth);
    if (denied) {
      return new Err(denied);
    }

    const window = resolveTimeWindow({ period, startDate, endDate, timezone });
    if (window.isErr()) {
      return new Err(new MCPError(window.error, { tracked: false }));
    }

    const result = await fetchTopUsers(auth, {
      startDate: window.value.startDate,
      endDate: window.value.endDate,
      limit: limit ?? DEFAULT_LIMIT,
      contextOrigin: source,
      agentIds,
      userIds,
    });

    if (result.isErr()) {
      return new Err(
        new MCPError(`Failed to retrieve top users: ${result.error.message}`)
      );
    }

    const { label, timezone: tz } = window.value;

    if (result.value.length === 0) {
      return new Ok([
        {
          type: "text" as const,
          text: `No user activity recorded for ${label} (${tz}).`,
        },
      ]);
    }

    const lines = result.value.map(
      (user, index) =>
        `${index + 1}. ${user.name} [${user.userId}] — ` +
        `${user.messageCount} messages, ${user.agentCount} agents`
    );

    return new Ok([
      {
        type: "text" as const,
        text:
          `Top users for ${label} (${tz}), most active first:\n` +
          lines.join("\n"),
      },
    ]);
  },
};

export const TOOLS = buildTools(WORKSPACE_ANALYTICS_TOOLS_METADATA, handlers);
