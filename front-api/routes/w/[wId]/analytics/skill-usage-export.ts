import { stringify } from "csv-stringify/sync";
import { Hono } from "hono";
import { z } from "zod";

import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";

import { DEFAULT_PERIOD_DAYS } from "@app/components/agent_builder/observability/constants";
import {
  fetchAvailableSkills,
  fetchSkillUsageMetrics,
} from "@app/lib/api/assistant/observability/skill_usage";
import { buildAgentAnalyticsBaseQuery } from "@app/lib/api/assistant/observability/utils";

const QuerySchema = z.object({
  days: z.coerce.number().positive().optional().default(DEFAULT_PERIOD_DAYS),
});

interface SkillUsageExportRow {
  date: string;
  skillName: string;
  executions: number;
  uniqueUsers: number;
}

// Mounted at /api/w/:wId/analytics/skill-usage-export.
const app = new Hono();

app.get("/", validate("query", QuerySchema), async (c) => {
  const auth = c.get("auth");

  if (!auth.isAdmin()) {
    return apiError(c, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "Only workspace admins can access workspace analytics.",
      },
    });
  }

  const { days } = c.req.valid("query");
  const owner = auth.getNonNullableWorkspace();
  const baseQuery = buildAgentAnalyticsBaseQuery({
    workspaceId: owner.sId,
    days,
  });

  const skillsResult = await fetchAvailableSkills(baseQuery);
  if (skillsResult.isErr()) {
    return apiError(c, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: `Failed to retrieve available skills: ${skillsResult.error.message}`,
      },
    });
  }

  const skills = skillsResult.value;
  const rows: SkillUsageExportRow[] = [];

  for (const skill of skills) {
    const usageResult = await fetchSkillUsageMetrics(
      baseQuery,
      skill.skillName
    );
    if (usageResult.isErr()) {
      return apiError(c, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: `Failed to retrieve skill usage for ${skill.skillName}: ${usageResult.error.message}`,
        },
      });
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
  const csvData = rows.map((row) => headers.map((h) => row[h]));
  const csv = stringify([headers, ...csvData], { header: false });

  c.header("Content-Type", "text/csv");
  c.header(
    "Content-Disposition",
    `attachment; filename="dust_skill_usage_last_${days}_days.csv"`
  );
  return c.body(csv);
});

export default app;
