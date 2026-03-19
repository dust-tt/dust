/**
 * @swagger
 * /api/v1/w/{wId}/analytics/export:
 *   get:
 *     summary: Export workspace analytics data
 *     description: |
 *       Export analytics data for the workspace identified by {wId} as CSV.
 *       Choose a table to export and provide a date range.
 *     tags:
 *       - Workspace
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         description: Unique string identifier for the workspace
 *         schema:
 *           type: string
 *       - in: query
 *         name: table
 *         required: true
 *         description: |
 *           The analytics table to export:
 *           - "usage_metrics": Daily messages, conversations, and active users
 *           - "active_users": Daily/weekly/monthly active user counts (DAU/WAU/MAU)
 *           - "source": Message counts broken down by source (context origin) per day
 *           - "agents": Agent list with message counts, users reached, and conversations
 *           - "users": User list with message counts, active days, and group memberships
 *           - "skill_usage": Skill execution counts and unique users per day
 *           - "tool_usage": Tool execution counts and unique users per day
 *         schema:
 *           type: string
 *           enum:
 *             - usage_metrics
 *             - active_users
 *             - source
 *             - agents
 *             - users
 *             - skill_usage
 *             - tool_usage
 *       - in: query
 *         name: startDate
 *         required: true
 *         description: Start date in YYYY-MM-DD format (inclusive)
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         required: true
 *         description: End date in YYYY-MM-DD format (inclusive)
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: timezone
 *         required: false
 *         description: IANA timezone string (defaults to UTC)
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: The analytics data as CSV
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *       400:
 *         description: Invalid request parameters
 *       403:
 *         description: The workspace does not have access to the analytics export API
 *       405:
 *         description: Method not supported
 */

import {
  AGENT_EXPORT_HEADERS,
  fetchAgentExportRows,
} from "@app/lib/api/analytics/agents_export";
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
import {
  buildAgentAnalyticsBaseQuery,
  timezoneSchema,
} from "@app/lib/api/assistant/observability/utils";
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
import type { estypes } from "@elastic/elasticsearch";
import { stringify } from "csv-stringify/sync";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { fromError } from "zod-validation-error";

const YYYY_MM_DD = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

const AnalyticsTableSchema = z.enum([
  "usage_metrics",
  "active_users",
  "source",
  "agents",
  "users",
  "skill_usage",
  "tool_usage",
]);

type AnalyticsTable = z.infer<typeof AnalyticsTableSchema>;

const QuerySchema = z.object({
  table: AnalyticsTableSchema,
  startDate: z.string().refine((s) => YYYY_MM_DD.test(s), {
    message: "startDate must be in YYYY-MM-DD format",
  }),
  endDate: z.string().refine((s) => YYYY_MM_DD.test(s), {
    message: "endDate must be in YYYY-MM-DD format",
  }),
  timezone: timezoneSchema,
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<string>>,
  auth: Authenticator
): Promise<void> {
  const flags = await getFeatureFlags(auth);
  if (!flags.includes("usage_data_api")) {
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
      const q = QuerySchema.safeParse({ table, startDate, endDate, timezone });
      if (!q.success) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: fromError(q.error).toString(),
          },
        });
      }

      if (q.data.startDate > q.data.endDate) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "startDate must be before or equal to endDate.",
          },
        });
      }

      const owner = auth.getNonNullableWorkspace();
      const csv = await exportTable({
        table: q.data.table,
        startDate: q.data.startDate,
        endDate: q.data.endDate,
        timezone: q.data.timezone,
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

// ---------------------------------------------------------------------------
// Table export helpers
// ---------------------------------------------------------------------------

async function exportTable({
  table,
  startDate,
  endDate,
  timezone,
  owner,
}: {
  table: AnalyticsTable;
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
      return exportSource({ startDate, endDate, owner });
    case "agents":
      return exportAgents({ startDate, endDate, owner });
    case "users":
      return exportUsers({ startDate, endDate, timezone, owner });
    case "skill_usage":
      return exportSkillUsage({ startDate, endDate, owner });
    case "tool_usage":
      return exportToolUsage({ startDate, endDate, owner });
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
    { startDate, endDate },
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

  const result = await fetchContextOriginDailyBreakdown(baseQuery);

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
  const csvData = rows.map((row) => [row.date, row.origin, row.messageCount]);

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
    AGENT_EXPORT_HEADERS.map((h) => row[h])
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
    USER_EXPORT_HEADERS.map((h) => row[h])
  );

  return new Ok(
    stringify([USER_EXPORT_HEADERS, ...csvData], { header: false })
  );
}

interface UsageExportRow {
  date: string;
  name: string;
  executions: number;
  uniqueUsers: number;
}

const USAGE_EXPORT_HEADERS: (keyof UsageExportRow)[] = [
  "date",
  "name",
  "executions",
  "uniqueUsers",
];

/**
 * Shared helper for skill_usage and tool_usage exports. Both follow the same
 * pattern: list available items, fetch per-item daily metrics, flatten into rows.
 */
async function exportItemUsage({
  startDate,
  endDate,
  owner,
  fetchItems,
  fetchUsage,
  label,
}: {
  startDate: string;
  endDate: string;
  owner: WorkspaceType;
  fetchItems: (
    q: estypes.QueryDslQueryContainer
  ) => Promise<Result<{ name: string }[], Error>>;
  fetchUsage: (
    q: estypes.QueryDslQueryContainer,
    name: string
  ) => Promise<
    Result<
      { date: string; executionCount: number; uniqueUsers: number }[],
      Error
    >
  >;
  label: string;
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
        `Failed to retrieve available ${label}s: ${itemsResult.error.message}`
      )
    );
  }

  const rows: UsageExportRow[] = [];

  for (const item of itemsResult.value) {
    const usageResult = await fetchUsage(baseQuery, item.name);
    if (usageResult.isErr()) {
      return new Err(
        new Error(
          `Failed to retrieve ${label} usage for ${item.name}: ${usageResult.error.message}`
        )
      );
    }

    for (const point of usageResult.value) {
      rows.push({
        date: point.date,
        name: item.name,
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
    return a.name.localeCompare(b.name);
  });

  const csvData = rows.map((row) => USAGE_EXPORT_HEADERS.map((h) => row[h]));

  return new Ok(
    stringify([USAGE_EXPORT_HEADERS, ...csvData], { header: false })
  );
}

async function exportSkillUsage({
  startDate,
  endDate,
  owner,
}: {
  startDate: string;
  endDate: string;
  owner: WorkspaceType;
}): Promise<Result<string, Error>> {
  return exportItemUsage({
    startDate,
    endDate,
    owner,
    fetchItems: async (q) => {
      const r = await fetchAvailableSkills(q);
      return r.isOk() ? new Ok(r.value.map((s) => ({ name: s.skillName }))) : r;
    },
    fetchUsage: fetchSkillUsageMetrics,
    label: "skill",
  });
}

async function exportToolUsage({
  startDate,
  endDate,
  owner,
}: {
  startDate: string;
  endDate: string;
  owner: WorkspaceType;
}): Promise<Result<string, Error>> {
  return exportItemUsage({
    startDate,
    endDate,
    owner,
    fetchItems: async (q) => {
      const r = await fetchAvailableTools(q);
      return r.isOk()
        ? new Ok(r.value.map((t) => ({ name: t.serverName })))
        : r;
    },
    fetchUsage: fetchToolUsageMetrics,
    label: "tool",
  });
}
