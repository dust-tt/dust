/** @ignoreswagger */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { getModelConfigByModelId } from "@app/lib/llms/model_configurations";
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

  switch (req.method) {
    case "GET": {
      const conversation = await ConversationResource.fetchById(
        auth,
        req.query.cId
      );

      if (!conversation) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "conversation_not_found",
            message: "Conversation not found.",
          },
        });
      }

      const lastAgentMessage =
        await conversation.getMostRecentCompletedAgentMessage(auth);

      if (!lastAgentMessage || !lastAgentMessage.runIds?.length) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "conversation_context_usage_not_found",
            message: "No completed agent message found in this conversation.",
          },
        });
      }

      // runIds is ordered chronologically (appended step by step in the agent loop), so the last
      // element is the most recent run.
      const run = await RunResource.fetchByDustRunId(auth, {
        dustRunId: lastAgentMessage.runIds[lastAgentMessage.runIds.length - 1],
      });

      if (!run) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "conversation_context_usage_not_found",
            message: "No run found for the last agent message.",
          },
        });
      }

      const usages = await run.listRunUsages(auth);

      if (usages.length === 0) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "conversation_context_usage_not_found",
            message: "No run usage found for the last agent message.",
          },
        });
      }

      // Take the max promptTokens across usages of the last run — in a
      // multi-step agent loop, each step sees all previous steps' outputs, so
      // the last step's promptTokens is the full context size as seen by the
      // model.
      const lastUsage = usages[usages.length - 1];
      const promptTokens = Math.max(...usages.map((u) => u.promptTokens));
      const modelConfig = getModelConfigByModelId(lastUsage.modelId);

      return res.status(200).json({
        providerId: lastUsage.providerId,
        modelId: lastUsage.modelId,
        promptTokens,
        contextSize: modelConfig?.contextSize ?? 0,
      });
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

export default withSessionAuthenticationForWorkspace(handler);
