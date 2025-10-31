import type { estypes } from "@elastic/elasticsearch";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { searchAnalytics } from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import type { AgentMessageAnalyticsData } from "@app/types/assistant/analytics";

const DEFAULT_PERIOD = 30;
const PAGE_SIZE = 1000;

const QuerySchema = z.object({
  days: z.coerce.number().positive().optional(),
});

function buildAgentAnalyticsBaseQuery(
  workspaceId: string,
  agentId: string,
  days: number
): estypes.QueryDslQueryContainer {
  return {
    bool: {
      filter: [
        { term: { workspace_id: workspaceId } },
        { term: { agent_id: agentId } },
        { range: { timestamp: { gte: `now-${days}d/d` } } },
      ],
    },
  };
}

function escapeCsvField(v: unknown): string {
  const s = v === undefined || v === null ? "" : String(v);
  // Always quote and escape quotes by doubling.
  const escaped = s.replace(/"/g, '""');
  return `"${escaped}"`;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<unknown>>,
  auth: Authenticator
) {
  if (typeof req.query.aId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid agent configuration ID.",
      },
    });
  }

  const assistant = await getAgentConfiguration(auth, {
    agentId: req.query.aId,
    variant: "light",
  });

  if (!assistant || (!assistant.canRead && !auth.isAdmin())) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "agent_configuration_not_found",
        message: "The agent you're trying to access was not found.",
      },
    });
  }
  if (!assistant.canEdit && !auth.isAdmin()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "app_auth_error",
        message: "Only editors can export agent observability data.",
      },
    });
  }

  const owner = auth.getNonNullableWorkspace();
  const flags = await getFeatureFlags(owner);
  if (!flags.includes("agent_builder_observability")) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "app_auth_error",
        message: "Observability is not enabled for this workspace.",
      },
    });
  }

  if (req.method !== "POST") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, POST is expected.",
      },
    });
  }

  const q = QuerySchema.safeParse(req.query);
  if (!q.success) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Invalid query parameters: ${q.error.message}`,
      },
    });
  }

  const days = q.data.days ?? DEFAULT_PERIOD;

  // Build CSV header
  const header = [
    "feedback_content",
    "thumbDirection",
    "feedback_created_at",
    "agent_message_content",
  ];

  const baseQuery = buildAgentAnalyticsBaseQuery(
    owner.sId,
    assistant.sId,
    days
  );

  // Prepare response headers for CSV download
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  const filename = `feedback_${assistant.sId}_${days}d.csv`;
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  // Collect rows (incremental implementation: accumulate in memory)
  const rows: string[] = [];
  rows.push(header.map(escapeCsvField).join(","));

  // Fetch first page deterministically (extend to pagination later if needed)
  const result = await searchAnalytics<AgentMessageAnalyticsData>(baseQuery, {
    size: PAGE_SIZE,
    sort: [{ timestamp: "asc" } as estypes.SortCombinations],
  });
  if (result.isErr()) {
    return apiError(req, res, {
      status_code: result.error.statusCode ?? 500,
      api_error: {
        type: "elasticsearch_error",
        message: result.error.message,
      },
    });
  }

  const hits = result.value.hits.hits;
  for (const h of hits) {
    const d = h._source as AgentMessageAnalyticsData | undefined;
    if (!d || !Array.isArray(d.feedbacks)) {
      continue;
    }
    for (const f of d.feedbacks) {
      if (f.dismissed) {
        continue;
      }
      const row = [
        escapeCsvField(f.content ?? ""),
        escapeCsvField(f.thumb_direction),
        escapeCsvField(f.created_at),
        escapeCsvField(""), // agent_message_content (filled in a later step if needed)
      ];
      rows.push(row.join(","));
    }
  }

  // Send CSV content
  res.status(200).send(rows.join("\n"));
}

export default withSessionAuthenticationForWorkspace(handler);
