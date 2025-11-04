import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

import { DEFAULT_PERIOD_DAYS } from "@app/components/agent_builder/observability/constants";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { reconstructContentFromStepContents } from "@app/lib/api/assistant/messages";
import {
  buildAgentAnalyticsBaseQuery,
  buildFeedbackQuery,
} from "@app/lib/api/assistant/observability/utils";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { CSVRecord } from "@app/lib/api/csv";
import { toCsv } from "@app/lib/api/csv";
import { searchAnalytics } from "@app/lib/api/elasticsearch";
import { processAndStoreFile } from "@app/lib/api/files/upload";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { AgentStepContentResource } from "@app/lib/resources/agent_step_content_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { ModelId, WithAPIErrorResponse } from "@app/types";
import { normalizeError } from "@app/types";
import type { AgentMessageAnalyticsData } from "@app/types/assistant/analytics";

const PAGE_SIZE = 1000;

const QuerySchema = z.object({
  days: z.coerce.number().positive().optional(),
  uploadAsFile: z.enum(["true", "false"]).optional(),
});

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

  // 1) Collect all message sIds that have feedbacks
  const messageSIds: string[] = [];
  for (const h of hits) {
    if (!h._source) {
      continue;
    }
    const d = h._source;
    if (!Array.isArray(d.feedbacks) || d.feedbacks.length === 0) {
      continue;
    }
    messageSIds.push(d.message_id);
  }

  // 2) Resolve message sIds to agent messages and fetch step contents via Resource
  const resolved = await AgentStepContentResource.fetchByMessageSIds(auth, {
    messageSIds,
    latestVersionsOnly: true,
  });

  const agentMessageIdByMessageSId = new Map<string, ModelId>();
  const stepContentsByAgentMessageId: Record<
    ModelId,
    AgentStepContentResource[]
  > = {};
  for (const r of resolved) {
    agentMessageIdByMessageSId.set(r.messageSId, r.agentMessageId);
    stepContentsByAgentMessageId[r.agentMessageId] = r.stepContents;
  }

  const messagesWithoutContent = messageSIds.filter(
    (sId) => !agentMessageIdByMessageSId.has(sId)
  );
  if (messagesWithoutContent.length > 0) {
    logger.info(
      {
        workspaceId: owner.sId,
        agentConfigurationId: assistant.sId,
        messagesWithoutContentCount: messagesWithoutContent.length,
        totalMessages: messageSIds.length,
      },
      "Some messages with feedback have no step contents"
    );
  }

  // 5) Build content map: message sId -> reconstructed content from step contents
  const contentByMessageSId = new Map<string, string>();

  for (const [messageSId, agentMessageId] of agentMessageIdByMessageSId) {
    const stepContents = (
      stepContentsByAgentMessageId[agentMessageId] ?? []
    ).sort((a, b) => a.step - b.step || a.index - b.index);

    try {
      const content = reconstructContentFromStepContents({
        stepContents,
      });
      contentByMessageSId.set(messageSId, content);
    } catch (err) {
      logger.warn(
        {
          messageSId,
          agentMessageId,
          error: normalizeError(err),
          workspaceId: owner.sId,
        },
        "[Feedback] - Failed to reconstruct content for message"
      );
      contentByMessageSId.set(messageSId, "");
    }
  }

  const records: CSVRecord[] = [];
  for (const h of hits) {
    if (!h._source) {
      continue;
    }
    const d = h._source;
    if (!Array.isArray(d.feedbacks)) {
      continue;
    }
    for (const f of d.feedbacks) {
      if (f.dismissed) {
        continue;
      }
      records.push({
        feedback_content: f.content ?? "",
        thumbDirection: f.thumb_direction,
        feedback_created_at: f.created_at,
        agent_message_content: contentByMessageSId.get(d.message_id) ?? "",
      });
    }
  }

  const csvContent = await toCsv(records, { header: true });
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
