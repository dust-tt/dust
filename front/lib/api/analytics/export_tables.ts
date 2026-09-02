import { fetchActiveUsersExportRows } from "@app/lib/api/analytics/active_users_export";
import type { AgentExportRow } from "@app/lib/api/analytics/agents_export";
import {
  AGENT_EXPORT_HEADERS,
  fetchAgentExportRows,
  toAgentExportCsvRow,
} from "@app/lib/api/analytics/agents_export";
import { buildConsumptionScopeQuery } from "@app/lib/api/analytics/consumption/scope";
import { rowsToCsv } from "@app/lib/api/analytics/csv_utils";
import type { FeedbackExportRow } from "@app/lib/api/analytics/feedback_export";
import {
  FEEDBACK_EXPORT_HEADERS,
  fetchFeedbackExportRows,
} from "@app/lib/api/analytics/feedback_export";
import type { MessageExportRow } from "@app/lib/api/analytics/messages_export";
import {
  fetchMessageExportRows,
  MESSAGE_EXPORT_HEADERS,
} from "@app/lib/api/analytics/messages_export";
import { fetchSkillUsageExportRows } from "@app/lib/api/analytics/skill_usage_export";
import type { SkillExportRow } from "@app/lib/api/analytics/skills_export";
import {
  fetchSkillExportRows,
  SKILL_EXPORT_HEADERS,
} from "@app/lib/api/analytics/skills_export";
import { fetchToolUsageExportRows } from "@app/lib/api/analytics/tool_usage_export";
import { fetchUsageMetricsExportRows } from "@app/lib/api/analytics/usage_metrics_export";
import type { UserExportRow } from "@app/lib/api/analytics/users_export";
import {
  fetchUserExportRows,
  USER_EXPORT_HEADERS,
} from "@app/lib/api/analytics/users_export";
import { fetchContextOriginDailyBreakdown } from "@app/lib/api/assistant/observability/context_origin";
import type { Authenticator } from "@app/lib/auth";
import { hasFeatureFlag } from "@app/lib/auth";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { WorkspaceType } from "@app/types/user";
import type { estypes } from "@elastic/elasticsearch";
import moment from "moment-timezone";

type AnalyticsExportTable =
  | "usage_metrics"
  | "active_users"
  | "source"
  | "agents"
  | "users"
  | "skills"
  | "skill_usage"
  | "tool_usage"
  | "messages"
  | "feedback";

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

type ExportTableData =
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
      table: "skills";
      headers: typeof SKILL_EXPORT_HEADERS;
      rows: SkillExportRow[];
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
    }
  | {
      table: "feedback";
      headers: typeof FEEDBACK_EXPORT_HEADERS;
      rows: FeedbackExportRow[];
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
      return exportUsageMetrics({ auth, startDate, endDate, timezone });
    case "active_users":
      return exportActiveUsers({ auth, startDate, endDate, timezone });
    case "source":
      return exportSource({ auth, startDate, endDate, timezone });
    case "agents":
      return exportAgents({
        auth,
        startDate,
        endDate,
        timezone,
        includeHiddenAgents,
      });
    case "users":
      return exportUsers({ auth, startDate, endDate, timezone, owner });
    case "skills":
      return exportSkills({ auth, startDate, endDate, timezone });
    case "skill_usage":
      return exportSkillUsage({ auth, startDate, endDate, timezone });
    case "tool_usage":
      return exportToolUsage({ auth, startDate, endDate, timezone });
    case "messages":
      return exportMessages({ auth, startDate, endDate, timezone, owner });
    case "feedback":
      return exportFeedback({ startDate, endDate, timezone, owner });
    default:
      assertNever(table);
  }
}

export function stringifyExportTableAsCsv(data: ExportTableData): string {
  switch (data.table) {
    case "usage_metrics":
      return rowsToCsv(data.headers, data.rows);
    case "active_users":
      return rowsToCsv(data.headers, data.rows);
    case "source":
      return rowsToCsv(data.headers, data.rows);
    case "agents":
      return rowsToCsv(data.headers, data.rows.map(toAgentExportCsvRow));
    case "users":
      return rowsToCsv(data.headers, data.rows);
    case "skills":
      return rowsToCsv(data.headers, data.rows);
    case "skill_usage":
      return rowsToCsv(data.headers, data.rows);
    case "tool_usage":
      return rowsToCsv(data.headers, data.rows);
    case "messages":
      return rowsToCsv(data.headers, data.rows);
    case "feedback":
      return rowsToCsv(data.headers, data.rows);
    default:
      assertNever(data);
  }
}

// exportTable's startDate/endDate are inclusive calendar days ("YYYY-MM-DD")
// in the requested timezone, while the consumption index's completed_at
// range is a half-open range of instants. Resolving bare date strings
// directly (as UTC midnight) would disagree with the date_histogram
// aggregations the export rows are built from, which bucket by calendar day
// in that same timezone — so bounds are resolved to timezone-local instants
// here too, mirroring exportUsers' membership-window resolution below.
function buildExportConsumptionScopeQuery(
  auth: Authenticator,
  {
    startDate,
    endDate,
    timezone,
  }: { startDate: string; endDate: string; timezone: string }
): estypes.QueryDslQueryContainer {
  const startInstant = moment
    .tz(startDate, timezone)
    .startOf("day")
    .toISOString();
  const exclusiveEndInstant = moment
    .tz(endDate, timezone)
    .add(1, "day")
    .startOf("day")
    .toISOString();

  return buildConsumptionScopeQuery({
    auth,
    startDate: startInstant,
    endDate: exclusiveEndInstant,
  });
}

async function exportUsageMetrics({
  auth,
  startDate,
  endDate,
  timezone,
}: {
  auth: Authenticator;
  startDate: string;
  endDate: string;
  timezone: string;
}): Promise<Result<ExportTableData, Error>> {
  const baseQuery = buildExportConsumptionScopeQuery(auth, {
    startDate,
    endDate,
    timezone,
  });

  const result = await fetchUsageMetricsExportRows(baseQuery, timezone);

  if (result.isErr()) {
    return new Err(
      new Error(`Failed to retrieve usage metrics: ${result.error.message}`)
    );
  }

  return new Ok({
    table: "usage_metrics",
    headers: USAGE_METRICS_HEADERS,
    rows: result.value,
  });
}

async function exportActiveUsers({
  auth,
  startDate,
  endDate,
  timezone,
}: {
  auth: Authenticator;
  startDate: string;
  endDate: string;
  timezone: string;
}): Promise<Result<ExportTableData, Error>> {
  const result = await fetchActiveUsersExportRows(auth, {
    startDate,
    endDate,
    timezone,
  });

  if (result.isErr()) {
    return new Err(
      new Error(
        `Failed to retrieve active users metrics: ${result.error.message}`
      )
    );
  }

  return new Ok({
    table: "active_users",
    headers: ACTIVE_USERS_HEADERS,
    rows: result.value,
  });
}

async function exportSource({
  auth,
  startDate,
  endDate,
  timezone,
}: {
  auth: Authenticator;
  startDate: string;
  endDate: string;
  timezone: string;
}): Promise<Result<ExportTableData, Error>> {
  const baseQuery = buildExportConsumptionScopeQuery(auth, {
    startDate,
    endDate,
    timezone,
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
  timezone,
  includeHiddenAgents,
}: {
  auth: Authenticator;
  startDate: string;
  endDate: string;
  timezone: string;
  includeHiddenAgents: boolean;
}): Promise<Result<ExportTableData, Error>> {
  const baseQuery = buildExportConsumptionScopeQuery(auth, {
    startDate,
    endDate,
    timezone,
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
  auth,
  startDate,
  endDate,
  timezone,
  owner,
}: {
  auth: Authenticator;
  startDate: string;
  endDate: string;
  timezone: string;
  owner: WorkspaceType;
}): Promise<Result<ExportTableData, Error>> {
  const baseQuery = buildExportConsumptionScopeQuery(auth, {
    startDate,
    endDate,
    timezone,
  });

  // `startDate` / `endDate` are plain YYYY-MM-DD days. Elasticsearch rounds a
  // date-only `lte` up to the end of that day, but the membership SQL filters
  // compare against instants, so the bounds have to be widened to the full day
  // in the requested timezone. Without this, memberships that started earlier
  // today (or ended later today) are dropped from the export.
  const result = await fetchUserExportRows({
    baseQuery,
    owner,
    startDate: moment.tz(startDate, timezone).startOf("day").toDate(),
    endDate: moment.tz(endDate, timezone).endOf("day").toDate(),
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

async function exportSkills({
  auth,
  startDate,
  endDate,
  timezone,
}: {
  auth: Authenticator;
  startDate: string;
  endDate: string;
  timezone: string;
}): Promise<Result<ExportTableData, Error>> {
  const baseQuery = buildExportConsumptionScopeQuery(auth, {
    startDate,
    endDate,
    timezone,
  });

  const result = await fetchSkillExportRows(auth, baseQuery, timezone);

  if (result.isErr()) {
    return new Err(
      new Error(`Failed to retrieve skills: ${result.error.message}`)
    );
  }

  return new Ok({
    table: "skills",
    headers: SKILL_EXPORT_HEADERS,
    rows: result.value,
  });
}

async function exportSkillUsage({
  auth,
  startDate,
  endDate,
  timezone,
}: {
  auth: Authenticator;
  startDate: string;
  endDate: string;
  timezone: string;
}): Promise<Result<ExportTableData, Error>> {
  const baseQuery = buildExportConsumptionScopeQuery(auth, {
    startDate,
    endDate,
    timezone,
  });

  const result = await fetchSkillUsageExportRows(auth, baseQuery, timezone);

  if (result.isErr()) {
    return new Err(
      new Error(`Failed to retrieve skill usage: ${result.error.message}`)
    );
  }

  return new Ok({
    table: "skill_usage",
    headers: SKILL_USAGE_HEADERS,
    rows: result.value,
  });
}

async function exportToolUsage({
  auth,
  startDate,
  endDate,
  timezone,
}: {
  auth: Authenticator;
  startDate: string;
  endDate: string;
  timezone: string;
}): Promise<Result<ExportTableData, Error>> {
  const baseQuery = buildExportConsumptionScopeQuery(auth, {
    startDate,
    endDate,
    timezone,
  });

  const result = await fetchToolUsageExportRows(baseQuery, timezone);

  if (result.isErr()) {
    return new Err(
      new Error(`Failed to retrieve tool usage: ${result.error.message}`)
    );
  }

  return new Ok({
    table: "tool_usage",
    headers: TOOL_USAGE_HEADERS,
    rows: result.value,
  });
}

async function exportMessages({
  auth,
  startDate,
  endDate,
  timezone,
  owner,
}: {
  auth: Authenticator;
  startDate: string;
  endDate: string;
  timezone: string;
  owner: WorkspaceType;
}): Promise<Result<ExportTableData, Error>> {
  const useConsumptionIndex = await hasFeatureFlag(
    auth,
    "message_export_from_consumption_index"
  );

  const result = await fetchMessageExportRows({
    auth,
    owner,
    startDate,
    endDate,
    timezone,
    useConsumptionIndex,
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

async function exportFeedback({
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
  const result = await fetchFeedbackExportRows({
    owner,
    startDate,
    endDate,
    timezone,
  });

  if (result.isErr()) {
    return new Err(
      new Error(`Failed to retrieve feedback export: ${result.error.message}`)
    );
  }

  return new Ok({
    table: "feedback",
    headers: FEEDBACK_EXPORT_HEADERS,
    rows: result.value,
  });
}
