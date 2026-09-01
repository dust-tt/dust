import { MCPError } from "@app/lib/actions/mcp_errors";
import { SKILL_MANAGEMENT_SERVER_NAME } from "@app/lib/actions/mcp_internal_actions/constants";
import type {
  ToolHandlerResult,
  ToolHandlers,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { workspaceManagerGuard } from "@app/lib/actions/mcp_internal_actions/utils";
import { WORKSPACE_ANALYTICS_TOOLS_METADATA } from "@app/lib/api/actions/servers/workspace_analytics/metadata";
import type {
  ConsumptionFilterInput,
  ResolvedTimeWindow,
  TimeWindowInput,
} from "@app/lib/api/actions/servers/workspace_analytics/query_input";
import {
  DEFAULT_CREDIT_GROUPS,
  DEFAULT_RESULTS,
  resolveTimeWindow,
  toConsumptionPeriod,
  toConsumptionScope,
} from "@app/lib/api/actions/servers/workspace_analytics/query_input";
import type {
  ConsumptionTopDimension,
  ConsumptionTopRankBy,
  ConsumptionTopUnit,
} from "@app/lib/api/analytics/consumption/scope";
import { CONSUMPTION_TOP_DIMENSION_UNIT } from "@app/lib/api/analytics/consumption/scope";
import type {
  ConsumptionTopGroup,
  ResolvedConsumptionGroup,
} from "@app/lib/api/analytics/consumption/top";
import {
  fetchConsumptionTopGroups,
  resolveConsumptionGroupLabels,
} from "@app/lib/api/analytics/consumption/top";
import { getAgentConfigurations } from "@app/lib/api/assistant/configuration/agent";
import {
  fetchCreditTimeseries,
  fetchCreditTimeseriesBreakdown,
  fetchCreditUsage,
} from "@app/lib/api/assistant/observability/credit_usage";
import { fetchMessageMetrics } from "@app/lib/api/assistant/observability/messages_metrics";
import { fetchSkillUsageMetrics } from "@app/lib/api/assistant/observability/skill_usage";
import { fetchToolUsageMetrics } from "@app/lib/api/assistant/observability/tool_usage";
import { buildAgentAnalyticsBaseQuery } from "@app/lib/api/assistant/observability/utils";
import type { Authenticator } from "@app/lib/auth";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { pluralize } from "@app/types/shared/utils/string_utils";
import moment from "moment-timezone";

function scopedBaseQuery(
  auth: Authenticator,
  window: ResolvedTimeWindow,
  {
    source,
    agentIds,
    userIds,
    agentTagIds,
    modelIds,
  }: {
    source?: string;
    agentIds?: string[];
    userIds?: string[];
    agentTagIds?: string[];
    modelIds?: string[];
  }
) {
  return buildAgentAnalyticsBaseQuery({
    workspaceId: auth.getNonNullableWorkspace().sId,
    startDate: window.startDate,
    endDate: window.endDate,
    contextOrigin: source,
    agentIds,
    userIds,
    agentTagIds,
    modelIds,
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

function excludeSkillManagement(
  dimension: ConsumptionTopDimension,
  groups: ConsumptionTopGroup[]
): { groups: ConsumptionTopGroup[]; skillManagementCredits: number } {
  if (dimension !== "tool") {
    return { groups, skillManagementCredits: 0 };
  }
  const skillManagementGroup = groups.find(
    (group) => group.key === SKILL_MANAGEMENT_SERVER_NAME
  );
  return {
    groups: groups.filter((group) => group !== skillManagementGroup),
    skillManagementCredits: skillManagementGroup?.credits ?? 0,
  };
}

function formatRankingText({
  dimension,
  label,
  tz,
  rankBy,
  unit,
  rows,
  totalCredits,
}: {
  dimension: ConsumptionTopDimension;
  label: string;
  tz: string;
  rankBy: ConsumptionTopRankBy;
  unit: ConsumptionTopUnit;
  rows: ResolvedConsumptionGroup[];
  totalCredits: number;
}): string {
  const metricLabel = rankBy === "credits" ? "credits" : `${unit}s`;

  if (rows.length === 0) {
    return `No ${dimension} ${metricLabel} recorded for ${label} (${tz}).`;
  }

  const lines = rows.map(
    (row, index) =>
      `${index + 1}. ${row.name} [${row.key}] — ` +
      `${row.credits.toFixed(2)} credits, ` +
      `${row.count} ${unit}${pluralize(row.count)} ` +
      `(${row.avgCredits.toFixed(2)} per ${unit})`
  );

  // e.g.:
  // Top agents for July 2026 (UTC), by credits, highest first:
  // 1. Support Bot [agentXYZ] — 152.30 credits, 42 messages (3.62 per message)
  // 2. Sales Bot [agentABC] — 98.10 credits, 12 messages (8.18 per message)
  //
  // Credits over the whole window, every row included: 250.40.
  return (
    `Top ${dimension}s for ${label} (${tz}), by ${metricLabel}, highest first:\n` +
    `${lines.join("\n")}\n\n` +
    `Credits over the whole window, every row included: ` +
    `${totalCredits.toFixed(2)}.`
  );
}

async function renderRanking(
  auth: Authenticator,
  {
    dimension,
    rankBy,
    limit,
    input,
  }: {
    dimension: ConsumptionTopDimension;
    rankBy: ConsumptionTopRankBy;
    limit: number | undefined;
    input: TimeWindowInput & ConsumptionFilterInput;
  }
): Promise<ToolHandlerResult> {
  const window = resolveTimeWindow(input);
  if (window.isErr()) {
    return new Err(new MCPError(window.error, { tracked: false }));
  }
  const { filter, agentTagIds } = toConsumptionScope(input);

  const result = await fetchConsumptionTopGroups(auth, {
    dimension,
    period: toConsumptionPeriod(window.value),
    limit: limit ?? DEFAULT_RESULTS,
    filter,
    agentTagIds,
    rankBy,
    includePreviousCredits: false,
    includeTotalCount: false,
  });

  if (result.isErr()) {
    return new Err(
      new MCPError(
        `Failed to rank ${dimension} by ${rankBy}: ${result.error.message}`
      )
    );
  }

  const { groups, skillManagementCredits } = excludeSkillManagement(
    dimension,
    result.value.groups
  );
  const rows = await resolveConsumptionGroupLabels(auth, dimension, groups);

  const { label, timezone: tz } = window.value;
  const text = formatRankingText({
    dimension,
    label,
    tz,
    rankBy,
    unit: CONSUMPTION_TOP_DIMENSION_UNIT[dimension],
    rows,
    totalCredits: result.value.totalCredits - skillManagementCredits,
  });

  return new Ok([{ type: "text" as const, text }]);
}

const handlers: ToolHandlers<typeof WORKSPACE_ANALYTICS_TOOLS_METADATA> = {
  get_agent_details: async ({ agentId }, { auth }) => {
    const deniedError = workspaceManagerGuard(auth);
    if (deniedError) {
      return new Err(deniedError);
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

    if (!agent.canRead) {
      return new Ok([
        {
          type: "text" as const,
          text:
            `Agent ${agent.name} [${agent.sId}]\n` +
            `- Description: (private agent - not available)\n` +
            `- Scope: ${agent.scope}\n` +
            `- Model: ${agent.model.providerId}/${agent.model.modelId}\n\n` +
            "Instructions, skills, and tools are not available for private " +
            "agents you do not have access to.",
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

  get_credit_usage: async (
    {
      limit,
      groupBy,
      period,
      startDate,
      endDate,
      timezone,
      source,
      agentIds,
      userIds,
      agentTagIds,
      modelIds,
    },
    { auth }
  ) => {
    const deniedError = workspaceManagerGuard(auth);
    if (deniedError) {
      return new Err(deniedError);
    }

    const window = resolveTimeWindow({ period, startDate, endDate, timezone });
    if (window.isErr()) {
      return new Err(new MCPError(window.error, { tracked: false }));
    }

    const selectedGroupBy = groupBy ?? "none";
    const result = await fetchCreditUsage(auth, {
      startDate: window.value.startDate,
      endDate: window.value.endDate,
      limit: limit ?? DEFAULT_RESULTS,
      groupBy: selectedGroupBy,
      contextOrigin: source,
      agentIds,
      userIds,
      agentTagIds,
      modelIds,
    });

    if (result.isErr()) {
      return new Err(
        new MCPError(`Failed to estimate credit usage: ${result.error.message}`)
      );
    }

    const { label, timezone: tz } = window.value;
    const { totalCredits, rows } = result.value;

    if (totalCredits === 0) {
      return new Ok([
        {
          type: "text" as const,
          text: `No credit usage recorded for ${label} (${tz}).`,
        },
      ]);
    }

    const header =
      `Estimated credit usage for ${label} (${tz}): ${totalCredits} credits. ` +
      "These are estimates — point the user to the workspace Usage page for " +
      "exact billed credits.";

    if (selectedGroupBy === "none" || rows.length === 0) {
      return new Ok([{ type: "text" as const, text: header }]);
    }

    const lines = rows.map(
      (row, index) =>
        `${index + 1}. ${row.name} [${row.groupKey}] — ` +
        `${row.totalCredits} credits`
    );

    return new Ok([
      {
        type: "text" as const,
        text:
          `${header}\nTop ${selectedGroupBy}s by estimated credits:\n` +
          lines.join("\n"),
      },
    ]);
  },

  get_credit_timeseries: async (
    {
      granularity,
      breakdownBy,
      breakdownLimit,
      period,
      startDate,
      endDate,
      timezone,
      source,
      agentIds,
      userIds,
      agentTagIds,
      modelIds,
    },
    { auth }
  ) => {
    const deniedError = workspaceManagerGuard(auth);
    if (deniedError) {
      return new Err(deniedError);
    }

    const window = resolveTimeWindow(
      { period, startDate, endDate, timezone },
      "last_30_days"
    );
    if (window.isErr()) {
      return new Err(new MCPError(window.error, { tracked: false }));
    }

    const { label, timezone: tz } = window.value;
    const interval = granularity ?? "day";
    const estimateNote =
      "These are estimates — point the user to the workspace Usage page for " +
      "exact billed credits";

    if (breakdownBy) {
      const result = await fetchCreditTimeseriesBreakdown(auth, {
        startDate: window.value.startDate,
        endDate: window.value.endDate,
        granularity: interval,
        timezone: window.value.timezone,
        breakdownBy,
        limit: breakdownLimit ?? DEFAULT_CREDIT_GROUPS,
        contextOrigin: source,
        agentIds,
        userIds,
        agentTagIds,
        modelIds,
      });

      if (result.isErr()) {
        return new Err(
          new MCPError(
            `Failed to estimate credit trend: ${result.error.message}`
          )
        );
      }

      const { groups, points } = result.value;
      if (
        groups.length === 0 ||
        points.every((point) => point.totalCredits === 0)
      ) {
        return new Ok([
          {
            type: "text" as const,
            text: `No credit usage recorded for ${label} (${tz}).`,
          },
        ]);
      }

      const series = [...groups.map((group) => group.name), "Other"].join(", ");
      const lines = points.map((point) => {
        const parts = groups.map(
          (group, index) => `${group.name} ${point.groupCredits[index]}`
        );
        parts.push(`Other ${point.otherCredits}`);
        return `${point.date}: ${parts.join(", ")} (total ${point.totalCredits})`;
      });

      return new Ok([
        {
          type: "text" as const,
          text:
            `Estimated credit usage per ${interval} for ${label} (${tz}), top ` +
            `${groups.length} ${breakdownBy}s plus 'other'. ${estimateNote}.\n` +
            `Series: ${series}\n` +
            lines.join("\n"),
        },
      ]);
    }

    const result = await fetchCreditTimeseries(auth, {
      startDate: window.value.startDate,
      endDate: window.value.endDate,
      granularity: interval,
      timezone: window.value.timezone,
      contextOrigin: source,
      agentIds,
      userIds,
      agentTagIds,
      modelIds,
    });

    if (result.isErr()) {
      return new Err(
        new MCPError(`Failed to estimate credit trend: ${result.error.message}`)
      );
    }

    const points = result.value;

    if (points.every((point) => point.totalCredits === 0)) {
      return new Ok([
        {
          type: "text" as const,
          text: `No credit usage recorded for ${label} (${tz}).`,
        },
      ]);
    }

    const lines = points.map(
      (point) => `${point.date}: ${point.totalCredits} credits`
    );

    return new Ok([
      {
        type: "text" as const,
        text:
          `Estimated credit usage per ${interval} for ${label} (${tz}). ` +
          `${estimateNote}:\n` +
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
      agentTagIds,
      modelIds,
    },
    { auth }
  ) => {
    const deniedError = workspaceManagerGuard(auth);
    if (deniedError) {
      return new Err(deniedError);
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
      agentTagIds,
      modelIds,
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
  get_top_entities_by_message_count: async (
    { dimension, limit, ...input },
    { auth }
  ) => {
    const deniedError = workspaceManagerGuard(auth);
    if (deniedError) {
      return new Err(deniedError);
    }
    return renderRanking(auth, { dimension, rankBy: "count", limit, input });
  },

  get_top_entities_by_execution_count: async (
    { dimension, limit, ...input },
    { auth }
  ) => {
    const deniedError = workspaceManagerGuard(auth);
    if (deniedError) {
      return new Err(deniedError);
    }
    return renderRanking(auth, { dimension, rankBy: "count", limit, input });
  },

  get_top_entities_by_credits: async (
    { dimension, limit, ...input },
    { auth }
  ) => {
    const deniedError = workspaceManagerGuard(auth);
    if (deniedError) {
      return new Err(deniedError);
    }
    return renderRanking(auth, { dimension, rankBy: "credits", limit, input });
  },
};

export const TOOLS = buildTools(WORKSPACE_ANALYTICS_TOOLS_METADATA, handlers);
