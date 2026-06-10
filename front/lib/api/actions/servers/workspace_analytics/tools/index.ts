import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerResult,
  ToolHandlers,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { workspaceAdminGuard } from "@app/lib/actions/mcp_internal_actions/utils";
import { WORKSPACE_ANALYTICS_TOOLS_METADATA } from "@app/lib/api/actions/servers/workspace_analytics/metadata";
import type { ResolvedTimeWindow } from "@app/lib/api/actions/servers/workspace_analytics/query_input";
import {
  DEFAULT_RESULTS,
  resolveTimeWindow,
} from "@app/lib/api/actions/servers/workspace_analytics/query_input";
import { getAgentConfigurations } from "@app/lib/api/assistant/configuration/agent";
import { fetchMessageMetrics } from "@app/lib/api/assistant/observability/messages_metrics";
import {
  fetchAvailableSkills,
  fetchSkillUsageMetrics,
} from "@app/lib/api/assistant/observability/skill_usage";
import {
  fetchAvailableTools,
  fetchToolUsageMetrics,
  resolveServerDisplayNames,
} from "@app/lib/api/assistant/observability/tool_usage";
import { fetchTopAgents } from "@app/lib/api/assistant/observability/top_agents";
import { fetchTopUsers } from "@app/lib/api/assistant/observability/top_users";
import { buildAgentAnalyticsBaseQuery } from "@app/lib/api/assistant/observability/utils";
import type { Authenticator } from "@app/lib/auth";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import moment from "moment-timezone";

function scopedBaseQuery(
  auth: Authenticator,
  window: ResolvedTimeWindow,
  {
    source,
    agentIds,
    userIds,
  }: { source?: string; agentIds?: string[]; userIds?: string[] }
) {
  return buildAgentAnalyticsBaseQuery({
    workspaceId: auth.getNonNullableWorkspace().sId,
    startDate: window.startDate,
    endDate: window.endDate,
    contextOrigin: source,
    agentIds,
    userIds,
  });
}

function renderExecutionSeries<
  T extends { date: string; executionCount: number; uniqueUsers: number },
>(
  result: Result<T[], Error>,
  metricLabel: string,
  windowLabel: string,
  tz: string
): ToolHandlerResult {
  if (result.isErr()) {
    return new Err(
      new MCPError(
        `Failed to retrieve usage time series: ${result.error.message}`
      )
    );
  }
  if (result.value.length === 0) {
    return new Ok([
      {
        type: "text" as const,
        text: `No ${metricLabel} usage recorded for ${windowLabel} (${tz}).`,
      },
    ]);
  }
  const lines = result.value.map(
    (point) =>
      `${point.date}: ${point.executionCount} executions, ` +
      `${point.uniqueUsers} unique users`
  );
  return new Ok([
    {
      type: "text" as const,
      text:
        `${metricLabel} usage per day for ${windowLabel} (${tz}):\n` +
        lines.join("\n"),
    },
  ]);
}

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
      limit: limit ?? DEFAULT_RESULTS,
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
      limit: limit ?? DEFAULT_RESULTS,
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

  get_agent_details: async ({ agentId }, { auth }) => {
    const denied = workspaceAdminGuard(auth);
    if (denied) {
      return new Err(denied);
    }

    const agents = await getAgentConfigurations(auth, {
      agentIds: [agentId],
      variant: "full",
    });
    const agent = agents[0];

    if (!agent) {
      return new Ok([
        {
          type: "text" as const,
          text:
            `No agent found with id ${agentId} (it may be archived or not ` +
            "accessible).",
        },
      ]);
    }

    const toolNames = agent.actions.map((action) => action.name).join(", ");
    const skillNames = (agent.skills ?? []).join(", ");

    return new Ok([
      {
        type: "text" as const,
        text:
          `Agent ${agent.name} [${agent.sId}]\n` +
          `- Description: ${agent.description}\n` +
          `- Scope: ${agent.scope}\n` +
          `- Model: ${agent.model.providerId}/${agent.model.modelId}\n` +
          `- Skills: ${skillNames || "none"}\n` +
          `- Tools: ${toolNames || "none"}\n\n` +
          "Instructions (full system prompt):\n" +
          `${agent.instructions ?? "(no instructions)"}`,
      },
    ]);
  },

  get_top_skills: async (
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

    const baseQuery = scopedBaseQuery(auth, window.value, {
      source,
      agentIds,
      userIds,
    });

    const result = await fetchAvailableSkills(baseQuery);
    if (result.isErr()) {
      return new Err(
        new MCPError(`Failed to retrieve skill usage: ${result.error.message}`)
      );
    }

    const { label, timezone: tz } = window.value;
    const skills = result.value.slice(0, limit ?? DEFAULT_RESULTS);

    if (skills.length === 0) {
      return new Ok([
        {
          type: "text" as const,
          text: `No skill usage recorded for ${label} (${tz}).`,
        },
      ]);
    }

    const lines = skills.map(
      (skill, index) =>
        `${index + 1}. ${skill.skillName} — ${skill.totalExecutions} executions`
    );

    return new Ok([
      {
        type: "text" as const,
        text:
          `Most-used skills for ${label} (${tz}), most used first:\n` +
          lines.join("\n"),
      },
    ]);
  },

  get_top_tools: async (
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

    const baseQuery = scopedBaseQuery(auth, window.value, {
      source,
      agentIds,
      userIds,
    });

    const result = await fetchAvailableTools(baseQuery);
    if (result.isErr()) {
      return new Err(
        new MCPError(`Failed to retrieve tool usage: ${result.error.message}`)
      );
    }

    const { label, timezone: tz } = window.value;
    const top = result.value.slice(0, limit ?? DEFAULT_RESULTS);

    if (top.length === 0) {
      return new Ok([
        {
          type: "text" as const,
          text: `No tool usage recorded for ${label} (${tz}).`,
        },
      ]);
    }

    const displayNames = await resolveServerDisplayNames(
      auth,
      top.map((tool) => tool.serverName)
    );

    const lines = top.map((tool, index) => {
      const displayName = displayNames.get(tool.serverName) ?? tool.displayName;
      const name =
        displayName === tool.serverName
          ? displayName
          : `${displayName} [${tool.serverName}]`;
      return `${index + 1}. ${name} — ${tool.totalExecutions} executions`;
    });

    return new Ok([
      {
        type: "text" as const,
        text:
          `Most-used tools for ${label} (${tz}), most used first:\n` +
          lines.join("\n"),
      },
    ]);
  },

  get_usage_timeseries: async (
    {
      metric,
      granularity,
      period,
      startDate,
      endDate,
      timezone,
      source,
      agentIds,
      userIds,
    },
    { auth }
  ) => {
    const denied = workspaceAdminGuard(auth);
    if (denied) {
      return new Err(denied);
    }

    const window = resolveTimeWindow(
      { period, startDate, endDate, timezone },
      "last_30_days"
    );
    if (window.isErr()) {
      return new Err(new MCPError(window.error, { tracked: false }));
    }

    const baseQuery = scopedBaseQuery(auth, window.value, {
      source,
      agentIds,
      userIds,
    });
    const { label, timezone: tz } = window.value;
    const selectedMetric = metric ?? "messages";

    switch (selectedMetric) {
      case "messages": {
        const interval = granularity ?? "day";
        const result = await fetchMessageMetrics(
          baseQuery,
          interval,
          ["conversations", "activeUsers"],
          tz
        );
        if (result.isErr()) {
          return new Err(
            new MCPError(
              `Failed to retrieve usage time series: ${result.error.message}`
            )
          );
        }
        if (result.value.length === 0) {
          return new Ok([
            {
              type: "text" as const,
              text: `No messages usage recorded for ${label} (${tz}).`,
            },
          ]);
        }
        const lines = result.value.map((point) => {
          const date = moment.tz(point.timestamp, tz).format("YYYY-MM-DD");
          return (
            `${date}: ${point.count} messages, ` +
            `${point.conversations} conversations, ` +
            `${point.activeUsers} active users`
          );
        });
        return new Ok([
          {
            type: "text" as const,
            text:
              `messages usage per ${interval} for ${label} (${tz}):\n` +
              lines.join("\n"),
          },
        ]);
      }
      case "skills":
        return renderExecutionSeries(
          await fetchSkillUsageMetrics(baseQuery, null, tz),
          "skills",
          label,
          tz
        );
      case "tools":
        return renderExecutionSeries(
          await fetchToolUsageMetrics(baseQuery, null, tz),
          "tools",
          label,
          tz
        );
      default:
        return assertNever(selectedMetric);
    }
  },
};

export const TOOLS = buildTools(WORKSPACE_ANALYTICS_TOOLS_METADATA, handlers);
