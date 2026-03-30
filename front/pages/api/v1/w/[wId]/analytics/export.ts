/** @ignoreswagger */

import {
  AGENT_EXPORT_HEADERS,
  fetchAgentExportRows,
} from "@app/lib/api/analytics/agents_export";
import { sanitizeCsvCell } from "@app/lib/api/analytics/csv_utils";
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
import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import { formatUTCDateFromMillis } from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { WorkspaceType } from "@app/types/user";
import type { GetAnalyticsExportRequestType } from "@dust-tt/client";
import { GetAnalyticsExportRequestSchema } from "@dust-tt/client";
import { stringify } from "csv-stringify/sync";
import type { NextApiRequest, NextApiResponse } from "next";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<string>>,
  auth: Authenticator
): Promise<void> {
  const flags = await getFeatureFlags(auth);
  if (!flags.includes("analytics_csv_export")) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "The workspace does not have access to the analytics export API.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const { table, startDate, endDate, timezone } = req.query;
      const q = GetAnalyticsExportRequestSchema.safeParse({
        table,
        startDate,
        endDate,
        timezone,
      });
      if (!q.success) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid query parameters: ${q.error.message}`,
          },
        });
      }

      const owner = auth.getNonNullableWorkspace();
      const csv = await exportTable({
        table: q.data.table,
        startDate: q.data.startDate,
        endDate: q.data.endDate,
        timezone: q.data.timezone ?? "UTC",
        owner,
      });

      if (csv.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: csv.error.message,
          },
        });
      }

      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="dust_${q.data.table}_${q.data.startDate}_${q.data.endDate}.csv"`
      );
      return res.status(200).send(csv.value);
    }
    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
  }
}

export default withPublicAPIAuthentication(handler);

interface SkillUsageExportRow {
  date: string;
  skillName: string;
  executions: number;
  uniqueUsers: number;
}

interface ToolUsageExportRow {
  date: string;
  toolName: string;
  executions: number;
  uniqueUsers: number;
}

async function exportTable({
  table,
  startDate,
  endDate,
  timezone,
  owner,
}: {
  table: GetAnalyticsExportRequestType["table"];
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
      return exportSkillUsage({ startDate, endDate, timezone, owner });
    case "tool_usage":
      return exportToolUsage({ startDate, endDate, timezone, owner });
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
}): Promise<Result<string, Error>> {
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

  const rows: SkillUsageExportRow[] = [];

  for (const skill of skillsResult.value) {
    const usageResult = await fetchSkillUsageMetrics(
      baseQuery,
      skill.skillName,
      timezone
    );
    if (usageResult.isErr()) {
      return new Err(
        new Error(
          `Failed to retrieve skill usage for ${skill.skillName}: ${usageResult.error.message}`
        )
      );
    }

    for (const point of usageResult.value) {
      rows.push({
        date: point.date,
        skillName: skill.skillName,
        executions: point.executionCount,
        uniqueUsers: point.uniqueUsers,
      });
    }
  }

  rows.sort((a, b) => {
    const dateCompare = a.date.localeCompare(b.date);
    if (dateCompare !== 0) {
      return dateCompare;
    }
    return a.skillName.localeCompare(b.skillName);
  });

  const headers: (keyof SkillUsageExportRow)[] = [
    "date",
    "skillName",
    "executions",
    "uniqueUsers",
  ];
  const csvData = rows.map((row) =>
    headers.map((h) => sanitizeCsvCell(row[h]))
  );

  return new Ok(stringify([headers, ...csvData], { header: false }));
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
}): Promise<Result<string, Error>> {
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

  const rows: ToolUsageExportRow[] = [];

  for (const tool of toolsResult.value) {
    const usageResult = await fetchToolUsageMetrics(
      baseQuery,
      tool.serverName,
      timezone
    );
    if (usageResult.isErr()) {
      return new Err(
        new Error(
          `Failed to retrieve tool usage for ${tool.serverName}: ${usageResult.error.message}`
        )
      );
    }

    for (const point of usageResult.value) {
      rows.push({
        date: point.date,
        toolName: tool.serverName,
        executions: point.executionCount,
        uniqueUsers: point.uniqueUsers,
      });
    }
  }

  rows.sort((a, b) => {
    const dateCompare = a.date.localeCompare(b.date);
    if (dateCompare !== 0) {
      return dateCompare;
    }
    return a.toolName.localeCompare(b.toolName);
  });

  const headers: (keyof ToolUsageExportRow)[] = [
    "date",
    "toolName",
    "executions",
    "uniqueUsers",
  ];
  const csvData = rows.map((row) =>
    headers.map((h) => sanitizeCsvCell(row[h]))
  );

  return new Ok(stringify([headers, ...csvData], { header: false }));
}
