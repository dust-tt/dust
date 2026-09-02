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
  TimeWindowInput,
} from "@app/lib/api/actions/servers/workspace_analytics/query_input";
import {
  DEFAULT_CREDIT_GROUPS,
  DEFAULT_RESULTS,
  resolveTimeWindow,
  toConsumptionPeriod,
  toConsumptionScope,
} from "@app/lib/api/actions/servers/workspace_analytics/query_input";
import { fetchConsumptionOverview } from "@app/lib/api/analytics/consumption/overview";
import { toConsumptionPeriodInput } from "@app/lib/api/analytics/consumption/schema";
import type {
  ConsumptionTopDimension,
  ConsumptionTopRankBy,
  ConsumptionTopUnit,
} from "@app/lib/api/analytics/consumption/scope";
import { CONSUMPTION_TOP_DIMENSION_UNIT } from "@app/lib/api/analytics/consumption/scope";
import type {
  ConsumptionTimeseriesGroup,
  ConsumptionTimeseriesPoint,
} from "@app/lib/api/analytics/consumption/timeseries";
import { fetchConsumptionTimeseries } from "@app/lib/api/analytics/consumption/timeseries";
import type {
  ConsumptionTopGroup,
  ResolvedConsumptionGroup,
} from "@app/lib/api/analytics/consumption/top";
import {
  fetchConsumptionTopGroups,
  resolveConsumptionGroupLabels,
} from "@app/lib/api/analytics/consumption/top";
import { getAgentConfigurations } from "@app/lib/api/assistant/configuration/agent";
import { formatDateFromMillis } from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import { Err, Ok } from "@app/types/shared/result";
import { pluralize } from "@app/types/shared/utils/string_utils";

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
  const filter = toConsumptionScope(input);

  const result = await fetchConsumptionTopGroups(auth, {
    dimension,
    period: toConsumptionPeriod(window.value),
    limit: limit ?? DEFAULT_RESULTS,
    filter,
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

function formatCreditLine(
  point: ConsumptionTimeseriesPoint,
  groups: ConsumptionTimeseriesGroup[],
  tz: string
): string {
  const parts = groups.map(
    ({ groupKey, name }) =>
      `${name}: ${(point.values[groupKey] ?? 0).toFixed(2)}`
  );
  return `${formatDateFromMillis(point.timestamp, tz)} — ${parts.join(", ")}`;
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

  get_consumption_overview: async (input, { auth }) => {
    const deniedError = workspaceManagerGuard(auth);
    if (deniedError) {
      return new Err(deniedError);
    }

    const filter = toConsumptionScope(input);
    const periodInput = toConsumptionPeriodInput(input);

    const result = await fetchConsumptionOverview(auth, {
      periodInput,
      filter,
    });

    if (result.isErr()) {
      return new Err(
        new MCPError(
          `Failed to retrieve the consumption overview: ${result.error.message}`
        )
      );
    }

    const overview = result.value;
    const label =
      periodInput.kind === "cycle"
        ? "the current billing cycle"
        : `the last ${periodInput.days} days`;
    const topAgent = overview.topAgent
      ? `${overview.topAgent.name} [${overview.topAgent.agentId}] ` +
        `(${overview.topAgent.credits.toFixed(2)} credits)`
      : "none";
    const creditCapLine = overview.creditUsage
      ? `\n- Credit cap: ${overview.creditUsage.status.usedPercentage}% of ` +
        `${overview.creditUsage.capCredits} used, resets ` +
        `${overview.creditUsage.status.resetAt}`
      : "";

    return new Ok([
      {
        type: "text" as const,
        text:
          `Workspace consumption for ${label}:\n` +
          `- Credits consumed: ${overview.totalCredits.toFixed(2)}\n` +
          `- Messages: ${overview.messageCount ?? 0}\n` +
          `- Active members: ${overview.members.active} of ` +
          `${overview.members.total}\n` +
          `- Top agent by credits: ${topAgent}\n` +
          `- Last recorded consumption: ${overview.lastRecordAt ?? "none"}` +
          creditCapLine,
      },
    ]);
  },

  get_credit_timeseries: async (
    { granularity = "day", breakdownBy, breakdownLimit, ...input },
    { auth }
  ) => {
    const deniedError = workspaceManagerGuard(auth);
    if (deniedError) {
      return new Err(deniedError);
    }

    const window = resolveTimeWindow(input, "last_30_days");
    if (window.isErr()) {
      return new Err(new MCPError(window.error, { tracked: false }));
    }
    const filter = toConsumptionScope(input);

    const result = await fetchConsumptionTimeseries(auth, {
      period: toConsumptionPeriod(window.value),
      granularity,
      mode: "period",
      breakdownBy,
      breakdownCount: breakdownLimit ?? DEFAULT_CREDIT_GROUPS,
      filter,
      timezone: window.value.timezone,
    });

    if (result.isErr()) {
      return new Err(
        new MCPError(
          `Failed to retrieve the credit trend: ${result.error.message}`
        )
      );
    }

    const { label, timezone: tz } = window.value;
    const { groups, points } = result.value;
    const active = points.filter((point) =>
      Object.values(point.values).some((value) => value > 0)
    );

    if (active.length === 0) {
      return new Ok([
        {
          type: "text" as const,
          text: `No credit consumption recorded for ${label} (${tz}).`,
        },
      ]);
    }

    const lines = active.map((point) => formatCreditLine(point, groups, tz));

    return new Ok([
      {
        type: "text" as const,
        text:
          `Credits per ${granularity} for ${label} (${tz}):\n` +
          lines.join("\n"),
      },
    ]);
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
