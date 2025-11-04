import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

import { DEFAULT_PERIOD_DAYS } from "@app/components/agent_builder/observability/constants";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import {
  buildAgentAnalyticsBaseQuery,
  buildFeedbackQuery,
} from "@app/lib/api/assistant/observability/utils";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { searchAnalytics } from "@app/lib/api/elasticsearch";
import { processAndStoreFile } from "@app/lib/api/files/upload";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import type { AgentMessageAnalyticsData } from "@app/types/assistant/analytics";

const PAGE_SIZE = 1000;

const QuerySchema = z.object({
  days: z.coerce.number().positive().optional(),
  uploadAsFile: z.enum(["true", "false"]).optional(),
});

// Build CSV header
const CSV_HEADERS = [
  "feedback_content",
  "thumbDirection",
  "feedback_created_at",
  "agent_message_content",
];

function escapeCsvField(v: unknown): string {
  const s = v === undefined || v === null ? "" : String(v);
  // Neutralize formula injection by prefixing dangerous characters with a single quote
  // This prevents spreadsheet software from interpreting the field as a formula
  const FORMULA_CHARS = ["=", "+", "-", "@"];
  const neutralized =
    s.length > 0 && FORMULA_CHARS.includes(s[0]) ? `'${s}` : s;
  // Always quote and escape quotes by doubling.
  const escaped = neutralized.replace(/"/g, '""');
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

  const { days, uploadAsFile } = q.data;

  const baseQuery = buildAgentAnalyticsBaseQuery({
    workspaceId: owner.sId,
    agentId: assistant.sId,
    days: days ?? DEFAULT_PERIOD_DAYS,
    feedbackNestedQuery: buildFeedbackQuery({ dismissed: false }),
  });

  // Collect rows (incremental implementation: accumulate in memory)
  const rows: string[] = [];
  rows.push(CSV_HEADERS.map(escapeCsvField).join(","));

  // Fetch first page deterministically (extend to pagination later if needed)
  const result = await searchAnalytics<AgentMessageAnalyticsData>(baseQuery, {
    size: PAGE_SIZE,
    sort: [{ timestamp: "asc" }],
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

  const csvContent = rows.join("\n");
  const filename = `feedback_${assistant.sId}_${days}d.csv`;

  if (uploadAsFile === "true") {
    // Create file and upload content
    const user = auth.getNonNullableUser();
    const file = await FileResource.makeNew({
      contentType: "text/csv",
      fileName: filename,
      fileSize: Buffer.byteLength(csvContent, "utf8"),
      userId: user.id,
      workspaceId: owner.id,
      useCase: "conversation",
    });

    // Use processAndStoreFile to create both original and processed versions
    const uploadResult = await processAndStoreFile(auth, {
      file,
      content: { type: "string", value: csvContent },
    });

    if (uploadResult.isErr()) {
      return apiError(req, res, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: `Failed to upload file: ${uploadResult.error.message}`,
        },
      });
    }

    // Return only the file ID
    res.status(200).json({ fileId: file.sId, filename });
  } else {
    // Prepare response headers for CSV download
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    // Send CSV content
    res.status(200).send(csvContent);
  }
}

export default withSessionAuthenticationForWorkspace(handler);
