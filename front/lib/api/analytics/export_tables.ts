import {
  AGENT_EXPORT_HEADERS,
  fetchAgentExportRows,
} from "@app/lib/api/analytics/agents_export";
import { sanitizeCsvCell } from "@app/lib/api/analytics/csv_utils";
import {
  fetchMessageExportRows,
  MESSAGE_EXPORT_HEADERS,
} from "@app/lib/api/analytics/messages_export";
import {
  fetchUserExportRows,
  USER_EXPORT_HEADERS,
} from "@app/lib/api/analytics/users_export";
import { fetchActiveUsersMetrics } from "@app/lib/api/assistant/observability/active_users_metrics";
import { fetchContextOriginDailyBreakdown } from "@app/lib/api/assistant/observability/context_origin";
import { fetchMessageMetrics } from "@app/lib/api/assistant/observability/messages_metrics";
import {
  fetchAvailableSkills,
  fetchSkillUsageMetrics,
} from "@app/lib/api/assistant/observability/skill_usage";
import {
  fetchAvailableTools,
  fetchToolUsageMetrics,
} from "@app/lib/api/assistant/observability/tool_usage";
import { buildAgentAnalyticsBaseQuery } from "@app/lib/api/assistant/observability/utils";
import { formatUTCDateFromMillis } from "@app/lib/api/elasticsearch";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { WorkspaceType } from "@app/types/user";
import type { estypes } from "@elastic/elasticsearch";
import { stringify } from "csv-stringify/sync";

type AnalyticsExportTable =
  | "usage_metrics"
  | "active_users"
  | "source"
  | "agents"
  | "users"
  | "skill_usage"
  | "tool_usage"
  | "messages";

interface UsageExportRow {
  date: string;
  name: string;
  executions: number;
  uniqueUsers: number;
}

export async function exportTable({
  table,
  startDate,
  endDate,
  timezone,
  owner,
}: {
  table: AnalyticsExportTable;
  startDate: string;
  endDate: string;
  timezone: string;
  owner: WorkspaceType;
}): Promise<Result<string, Error>> {
  switch (table) {
    case "usage_metrics":
      return exportUsageMetrics({ startDate, endDate, timezone, owner });
    case "active_users":
      return exportActiveUsers({ startDate, endDate, timezone, owner });
    case "source":
      return exportSource({ startDate, endDate, timezone, owner });
    case "agents":
      return exportAgents({ startDate, endDate, owner });
    case "users":
      return exportUsers({ startDate, endDate, timezone, owner });
    case "skill_usage":
      return exportItemUsage({
        startDate,
        endDate,
        timezone,
        owner,
        headerLabel: "skillName",
        fetchItems: async (q) => {
          const r = await fetchAvailableSkills(q);
          return r.isOk()
            ? new Ok(r.value.map((s) => ({ name: s.skillName })))
            : r;
        },
        fetchMetrics: fetchSkillUsageMetrics,
      });
    case "tool_usage":
      return exportItemUsage({
        startDate,
        endDate,
        timezone,
        owner,
        headerLabel: "toolName",
        fetchItems: async (q) => {
          const r = await fetchAvailableTools(q);
          return r.isOk()
            ? new Ok(r.value.map((t) => ({ name: t.serverName })))
            : r;
        },
        fetchMetrics: fetchToolUsageMetrics,
      });
    case "messages":
      return exportMessages({ startDate, endDate, timezone, owner });
    default:
      assertNever(table);
  }
}

async function exportUsageMetrics({
  startDate,
  endDate,
  timezone,
  owner,
}: {
  startDate: string;
  endDate: string;
  timezone: string;
  owner: WorkspaceType;
}): Promise<Result<string, Error>> {
  const baseQuery = buildAgentAnalyticsBaseQuery({
    workspaceId: owner.sId,
    startDate,
    endDate,
  });

  const result = await fetchMessageMetrics(
    baseQuery,
    "day",
    ["conversations", "activeUsers"] as const,
    timezone
  );

  if (result.isErr()) {
    return new Err(
      new Error(`Failed to retrieve usage metrics: ${result.error.message}`)
    );
  }

  const headers = ["date", "messages", "conversations", "activeUsers"];
  const csvData = result.value.map((point) => [
    formatUTCDateFromMillis(point.timestamp),
    point.count,
    point.conversations,
    point.activeUsers,
  ]);

  return new Ok(stringify([headers, ...csvData], { header: false }));
}

async function exportActiveUsers({
  startDate,
  endDate,
  timezone,
  owner,
}: {
  startDate: string;
  endDate: string;
  timezone: string;
  owner: WorkspaceType;
}): Promise<Result<string, Error>> {
  const result = await fetchActiveUsersMetrics(
    owner,
    startDate,
    endDate,
    timezone
  );

  if (result.isErr()) {
    return new Err(
      new Error(
        `Failed to retrieve active users metrics: ${result.error.message}`
      )
    );
  }

  const headers = ["date", "dau", "wau", "mau"];
  const csvData = result.value.map((point) => [
    point.date,
    point.dau,
    point.wau,
    point.mau,
  ]);

  return new Ok(stringify([headers, ...csvData], { header: false }));
}

async function exportSource({
  startDate,
  endDate,
  timezone,
  owner,
}: {
  startDate: string;
  endDate: string;
  timezone: string;
  owner: WorkspaceType;
}): Promise<Result<string, Error>> {
  const baseQuery = buildAgentAnalyticsBaseQuery({
    workspaceId: owner.sId,
    startDate,
    endDate,
  });

  const result = await fetchContextOriginDailyBreakdown(baseQuery, timezone);

  if (result.isErr()) {
    return new Err(
      new Error(`Failed to retrieve source breakdown: ${result.error.message}`)
    );
  }

  const rows = [...result.value].sort((a, b) => {
    const dateCompare = a.date.localeCompare(b.date);
    if (dateCompare !== 0) {
      return dateCompare;
    }
    return a.origin.localeCompare(b.origin);
  });

  const headers = ["date", "source", "messageCount"];
  const csvData = rows.map((row) => [
    row.date,
    sanitizeCsvCell(row.origin),
    row.messageCount,
  ]);

  return new Ok(stringify([headers, ...csvData], { header: false }));
}

async function exportAgents({
  startDate,
  endDate,
  owner,
}: {
  startDate: string;
  endDate: string;
  owner: WorkspaceType;
}): Promise<Result<string, Error>> {
  const baseQuery = buildAgentAnalyticsBaseQuery({
    workspaceId: owner.sId,
    startDate,
    endDate,
  });

  const result = await fetchAgentExportRows(baseQuery, owner);

  if (result.isErr()) {
    return new Err(
      new Error(`Failed to retrieve agent analytics: ${result.error.message}`)
    );
  }

  const csvData = result.value.map((row) =>
    AGENT_EXPORT_HEADERS.map((h) => sanitizeCsvCell(row[h]))
  );

  return new Ok(
    stringify([AGENT_EXPORT_HEADERS, ...csvData], { header: false })
  );
}

async function exportUsers({
  startDate,
  endDate,
  timezone,
  owner,
}: {
  startDate: string;
  endDate: string;
  timezone: string;
  owner: WorkspaceType;
}): Promise<Result<string, Error>> {
  const baseQuery = buildAgentAnalyticsBaseQuery({
    workspaceId: owner.sId,
    startDate,
    endDate,
  });

  const result = await fetchUserExportRows({
    baseQuery,
    owner,
    startDate: new Date(startDate),
    endDate: new Date(endDate),
    timezone,
  });

  if (result.isErr()) {
    return new Err(
      new Error(`Failed to retrieve user analytics: ${result.error.message}`)
    );
  }

  const csvData = result.value.map((row) =>
    USER_EXPORT_HEADERS.map((h) => sanitizeCsvCell(row[h]))
  );

  return new Ok(
    stringify([USER_EXPORT_HEADERS, ...csvData], { header: false })
  );
}

async function exportItemUsage({
  startDate,
  endDate,
  timezone,
  owner,
  headerLabel,
  fetchItems,
  fetchMetrics,
}: {
  startDate: string;
  endDate: string;
  timezone: string;
  owner: WorkspaceType;
  headerLabel: string;
  fetchItems: (
    q: estypes.QueryDslQueryContainer
  ) => Promise<Result<{ name: string }[], Error>>;
  fetchMetrics: (
    q: estypes.QueryDslQueryContainer,
    name: string,
    tz: string
  ) => Promise<
    Result<
      { date: string; executionCount: number; uniqueUsers: number }[],
      Error
    >
  >;
}): Promise<Result<string, Error>> {
  const baseQuery = buildAgentAnalyticsBaseQuery({
    workspaceId: owner.sId,
    startDate,
    endDate,
  });

  const itemsResult = await fetchItems(baseQuery);
  if (itemsResult.isErr()) {
    return new Err(
      new Error(
        `Failed to retrieve available ${headerLabel}s: ${itemsResult.error.message}`
      )
    );
  }

  const nestedRows = await concurrentExecutor(
    itemsResult.value,
    async (item) => {
      const usageResult = await fetchMetrics(baseQuery, item.name, timezone);
      if (usageResult.isErr()) {
        throw new Error(
          `Failed to retrieve ${headerLabel} usage for ${item.name}: ${usageResult.error.message}`
        );
      }
      return usageResult.value.map((point) => ({
        date: point.date,
        name: item.name,
        executions: point.executionCount,
        uniqueUsers: point.uniqueUsers,
      }));
    },
    { concurrency: 8 }
  );

  const rows: UsageExportRow[] = nestedRows.flat();

  rows.sort((a, b) => {
    const dateCompare = a.date.localeCompare(b.date);
    if (dateCompare !== 0) {
      return dateCompare;
    }
    return a.name.localeCompare(b.name);
  });

  const headers: string[] = ["date", headerLabel, "executions", "uniqueUsers"];
  const csvData = rows.map((row) => [
    sanitizeCsvCell(row.date),
    sanitizeCsvCell(row.name),
    row.executions,
    row.uniqueUsers,
  ]);

  return new Ok(stringify([headers, ...csvData], { header: false }));
}

async function exportMessages({
  startDate,
  endDate,
  timezone,
  owner,
}: {
  startDate: string;
  endDate: string;
  timezone: string;
  owner: WorkspaceType;
}): Promise<Result<string, Error>> {
  const result = await fetchMessageExportRows({
    workspaceId: owner.sId,
    workspaceModelId: owner.id,
    startDate,
    endDate,
    timezone,
  });

  if (result.isErr()) {
    return new Err(
      new Error(`Failed to retrieve message export: ${result.error.message}`)
    );
  }

  const csvData = result.value.map((row) =>
    MESSAGE_EXPORT_HEADERS.map((h) => sanitizeCsvCell(row[h]))
  );

  return new Ok(
    stringify([MESSAGE_EXPORT_HEADERS, ...csvData], { header: false })
  );
}
