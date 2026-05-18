import type { AgentExportRow } from "@app/lib/api/analytics/agents_export";
import {
  AGENT_EXPORT_HEADERS,
  fetchAgentExportRows,
} from "@app/lib/api/analytics/agents_export";
import { sanitizeCsvCell } from "@app/lib/api/analytics/csv_utils";
import type { MessageExportRow } from "@app/lib/api/analytics/messages_export";
import {
  fetchMessageExportRows,
  MESSAGE_EXPORT_HEADERS,
} from "@app/lib/api/analytics/messages_export";
import type { UserExportRow } from "@app/lib/api/analytics/users_export";
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
import type { Authenticator } from "@app/lib/auth";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { WorkspaceType } from "@app/types/user";
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

interface UsageMetricsRow {
  date: string;
  messages: number;
  conversations: number;
  activeUsers: number;
}

interface ActiveUsersRow {
  date: string;
  dau: number;
  wau: number;
  mau: number;
}

interface SourceRow {
  date: string;
  source: string;
  messageCount: number;
}

interface SkillUsageRow {
  date: string;
  skillName: string;
  executions: number;
  uniqueUsers: number;
}

interface ToolUsageRow {
  date: string;
  toolName: string;
  executions: number;
  uniqueUsers: number;
}

const USAGE_METRICS_HEADERS = [
  "date",
  "messages",
  "conversations",
  "activeUsers",
] as const satisfies readonly (keyof UsageMetricsRow)[];

const ACTIVE_USERS_HEADERS = [
  "date",
  "dau",
  "wau",
  "mau",
] as const satisfies readonly (keyof ActiveUsersRow)[];

const SOURCE_HEADERS = [
  "date",
  "source",
  "messageCount",
] as const satisfies readonly (keyof SourceRow)[];

const SKILL_USAGE_HEADERS = [
  "date",
  "skillName",
  "executions",
  "uniqueUsers",
] as const satisfies readonly (keyof SkillUsageRow)[];

const TOOL_USAGE_HEADERS = [
  "date",
  "toolName",
  "executions",
  "uniqueUsers",
] as const satisfies readonly (keyof ToolUsageRow)[];

export type ExportTableData =
  | {
      table: "usage_metrics";
      headers: typeof USAGE_METRICS_HEADERS;
      rows: UsageMetricsRow[];
    }
  | {
      table: "active_users";
      headers: typeof ACTIVE_USERS_HEADERS;
      rows: ActiveUsersRow[];
    }
  | {
      table: "source";
      headers: typeof SOURCE_HEADERS;
      rows: SourceRow[];
    }
  | {
      table: "agents";
      headers: typeof AGENT_EXPORT_HEADERS;
      rows: AgentExportRow[];
    }
  | {
      table: "users";
      headers: typeof USER_EXPORT_HEADERS;
      rows: UserExportRow[];
    }
  | {
      table: "skill_usage";
      headers: typeof SKILL_USAGE_HEADERS;
      rows: SkillUsageRow[];
    }
  | {
      table: "tool_usage";
      headers: typeof TOOL_USAGE_HEADERS;
      rows: ToolUsageRow[];
    }
  | {
      table: "messages";
      headers: typeof MESSAGE_EXPORT_HEADERS;
      rows: MessageExportRow[];
    };

export async function exportTable({
  auth,
  table,
  startDate,
  endDate,
  timezone,
  owner,
  includeHiddenAgents,
}: {
  auth: Authenticator;
  table: AnalyticsExportTable;
  startDate: string;
  endDate: string;
  timezone: string;
  owner: WorkspaceType;
  includeHiddenAgents: boolean;
}): Promise<Result<ExportTableData, Error>> {
  switch (table) {
    case "usage_metrics":
      return exportUsageMetrics({ startDate, endDate, timezone, owner });
    case "active_users":
      return exportActiveUsers({ startDate, endDate, timezone, owner });
    case "source":
      return exportSource({ startDate, endDate, timezone, owner });
    case "agents":
      return exportAgents({
        auth,
        startDate,
        endDate,
        owner,
        includeHiddenAgents,
      });
    case "users":
      return exportUsers({ startDate, endDate, timezone, owner });
    case "skill_usage":
      return exportSkillUsage({ startDate, endDate, timezone, owner });
    case "tool_usage":
      return exportToolUsage({ startDate, endDate, timezone, owner });
    case "messages":
      return exportMessages({ startDate, endDate, timezone, owner });
    default:
      assertNever(table);
  }
}

export function stringifyExportTableAsCsv(data: ExportTableData): string {
  switch (data.table) {
    case "usage_metrics":
      return stringifyRowsAsCsv(data.headers, data.rows);
    case "active_users":
      return stringifyRowsAsCsv(data.headers, data.rows);
    case "source":
      return stringifyRowsAsCsv(data.headers, data.rows);
    case "agents":
      return stringifyRowsAsCsv(data.headers, data.rows);
    case "users":
      return stringifyRowsAsCsv(data.headers, data.rows);
    case "skill_usage":
      return stringifyRowsAsCsv(data.headers, data.rows);
    case "tool_usage":
      return stringifyRowsAsCsv(data.headers, data.rows);
    case "messages":
      return stringifyRowsAsCsv(data.headers, data.rows);
    default:
      assertNever(data);
  }
}

function stringifyRowsAsCsv<
  K extends string,
  R extends Record<K, string | number>,
>(headers: readonly K[], rows: readonly R[]): string {
  const csvData = rows.map((row) =>
    headers.map((h) => sanitizeCsvCell(row[h]))
  );
  return stringify([[...headers], ...csvData], { header: false });
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
}): Promise<Result<ExportTableData, Error>> {
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

  const rows: UsageMetricsRow[] = result.value.map((point) => ({
    date: formatUTCDateFromMillis(point.timestamp),
    messages: point.count,
    conversations: point.conversations,
    activeUsers: point.activeUsers,
  }));

  return new Ok({
    table: "usage_metrics",
    headers: USAGE_METRICS_HEADERS,
    rows,
  });
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
}): Promise<Result<ExportTableData, Error>> {
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

  const rows: ActiveUsersRow[] = result.value.map((point) => ({
    date: point.date,
    dau: point.dau,
    wau: point.wau,
    mau: point.mau,
  }));

  return new Ok({
    table: "active_users",
    headers: ACTIVE_USERS_HEADERS,
    rows,
  });
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
}): Promise<Result<ExportTableData, Error>> {
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

  const rows: SourceRow[] = [...result.value]
    .sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) {
        return dateCompare;
      }
      return a.origin.localeCompare(b.origin);
    })
    .map((row) => ({
      date: row.date,
      source: row.origin,
      messageCount: row.messageCount,
    }));

  return new Ok({ table: "source", headers: SOURCE_HEADERS, rows });
}

async function exportAgents({
  auth,
  startDate,
  endDate,
  owner,
  includeHiddenAgents,
}: {
  auth: Authenticator;
  startDate: string;
  endDate: string;
  owner: WorkspaceType;
  includeHiddenAgents: boolean;
}): Promise<Result<ExportTableData, Error>> {
  const baseQuery = buildAgentAnalyticsBaseQuery({
    workspaceId: owner.sId,
    startDate,
    endDate,
  });

  const result = await fetchAgentExportRows(
    baseQuery,
    auth,
    includeHiddenAgents
  );

  if (result.isErr()) {
    return new Err(
      new Error(`Failed to retrieve agent analytics: ${result.error.message}`)
    );
  }

  return new Ok({
    table: "agents",
    headers: AGENT_EXPORT_HEADERS,
    rows: result.value,
  });
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
}): Promise<Result<ExportTableData, Error>> {
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

  return new Ok({
    table: "users",
    headers: USER_EXPORT_HEADERS,
    rows: result.value,
  });
}

async function exportSkillUsage({
  startDate,
  endDate,
  timezone,
  owner,
}: {
  startDate: string;
  endDate: string;
  timezone: string;
  owner: WorkspaceType;
}): Promise<Result<ExportTableData, Error>> {
  const baseQuery = buildAgentAnalyticsBaseQuery({
    workspaceId: owner.sId,
    startDate,
    endDate,
  });

  const skillsResult = await fetchAvailableSkills(baseQuery);
  if (skillsResult.isErr()) {
    return new Err(
      new Error(
        `Failed to retrieve available skills: ${skillsResult.error.message}`
      )
    );
  }

  const nestedRows = await concurrentExecutor(
    skillsResult.value,
    async (item) => {
      const usageResult = await fetchSkillUsageMetrics(
        baseQuery,
        item.skillName,
        timezone
      );
      if (usageResult.isErr()) {
        throw new Error(
          `Failed to retrieve skill usage for ${item.skillName}: ${usageResult.error.message}`
        );
      }
      return usageResult.value.map<SkillUsageRow>((point) => ({
        date: point.date,
        skillName: item.skillName,
        executions: point.executionCount,
        uniqueUsers: point.uniqueUsers,
      }));
    },
    { concurrency: 8 }
  );

  const rows = nestedRows.flat().sort((a, b) => {
    const dateCompare = a.date.localeCompare(b.date);
    if (dateCompare !== 0) {
      return dateCompare;
    }
    return a.skillName.localeCompare(b.skillName);
  });

  return new Ok({
    table: "skill_usage",
    headers: SKILL_USAGE_HEADERS,
    rows,
  });
}

async function exportToolUsage({
  startDate,
  endDate,
  timezone,
  owner,
}: {
  startDate: string;
  endDate: string;
  timezone: string;
  owner: WorkspaceType;
}): Promise<Result<ExportTableData, Error>> {
  const baseQuery = buildAgentAnalyticsBaseQuery({
    workspaceId: owner.sId,
    startDate,
    endDate,
  });

  const toolsResult = await fetchAvailableTools(baseQuery);
  if (toolsResult.isErr()) {
    return new Err(
      new Error(
        `Failed to retrieve available tools: ${toolsResult.error.message}`
      )
    );
  }

  const nestedRows = await concurrentExecutor(
    toolsResult.value,
    async (item) => {
      const usageResult = await fetchToolUsageMetrics(
        baseQuery,
        item.serverName,
        timezone
      );
      if (usageResult.isErr()) {
        throw new Error(
          `Failed to retrieve tool usage for ${item.serverName}: ${usageResult.error.message}`
        );
      }
      return usageResult.value.map<ToolUsageRow>((point) => ({
        date: point.date,
        toolName: item.serverName,
        executions: point.executionCount,
        uniqueUsers: point.uniqueUsers,
      }));
    },
    { concurrency: 8 }
  );

  const rows = nestedRows.flat().sort((a, b) => {
    const dateCompare = a.date.localeCompare(b.date);
    if (dateCompare !== 0) {
      return dateCompare;
    }
    return a.toolName.localeCompare(b.toolName);
  });

  return new Ok({
    table: "tool_usage",
    headers: TOOL_USAGE_HEADERS,
    rows,
  });
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
}): Promise<Result<ExportTableData, Error>> {
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

  return new Ok({
    table: "messages",
    headers: MESSAGE_EXPORT_HEADERS,
    rows: result.value,
  });
}
