/** @ignoreswagger */
import { apiErrorForConversation } from "@app/lib/api/assistant/conversation/helper";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { getModelConfigByModelId } from "@app/lib/llms/model_configurations";
import {
  AgentMessageModel,
  MessageModel,
} from "@app/lib/models/agent/conversation";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { RunResource } from "@app/lib/resources/run_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";

export type GetConversationContextUsageResponse = {
  providerId: string;
  modelId: string;
  promptTokens: number;
  contextSize: number;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetConversationContextUsageResponse>
  >,
  auth: Authenticator
): Promise<void> {
  if (!(typeof req.query.cId === "string")) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid query parameters, `cId` (string) is required.",
      },
    });
  }

  if (req.method !== "GET") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "Only GET is supported.",
      },
    });
  }

  const conversationId = req.query.cId;
  const conversationRes =
    await ConversationResource.fetchConversationWithoutContent(
      auth,
      conversationId
    );

  if (conversationRes.isErr()) {
    return apiErrorForConversation(req, res, conversationRes.error);
  }

  const conversation = conversationRes.value;

  // Find the last terminal agent message in the conversation.
  const lastAgentMessage = await AgentMessageModel.findOne({
    where: {
      workspaceId: auth.getNonNullableWorkspace().id,
      status: ["succeeded", "gracefully_stopped"],
    },
    include: [
      {
        model: MessageModel,
        as: "message",
        required: true,
        where: {
          conversationId: conversation.id,
          workspaceId: auth.getNonNullableWorkspace().id,
        },
      },
    ],
    order: [["createdAt", "DESC"]],
  });

  if (!lastAgentMessage || !lastAgentMessage.runIds?.length) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "conversation_not_found",
        message: "No completed agent message found in this conversation.",
      },
    });
  }

  // runIds is ordered chronologically (appended step by step in the agent loop),
  // so the last element is the most recent run.
  const lastRunId = lastAgentMessage.runIds[lastAgentMessage.runIds.length - 1];

  const usages = await RunResource.fetchRunUsagesByDustRunId(auth, {
    dustRunId: lastRunId,
  });

  if (!usages || usages.length === 0) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "conversation_not_found",
        message: "No run usage found for the last agent message.",
      },
    });
  }

  // Take the max promptTokens across usages of the last run — in a multi-step
  // agent loop, each step sees all previous steps' outputs, so the last step's
  // promptTokens is the full context size as seen by the model.
  const lastUsage = usages[usages.length - 1];
  const promptTokens = Math.max(...usages.map((u) => u.promptTokens));

  const modelConfig = getModelConfigByModelId(lastUsage.modelId);

  res.status(200).json({
    providerId: lastUsage.providerId,
    modelId: lastUsage.modelId,
    promptTokens,
    contextSize: modelConfig?.contextSize ?? 0,
  });
}

export default withSessionAuthenticationForWorkspace(handler);
