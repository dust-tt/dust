/** @ignoreswagger */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { getModelConfigByModelId } from "@app/lib/llms/model_configurations";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { apiError } from "@app/logger/withlogging";
import type { SupportedModel } from "@app/types/assistant/models/types";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";

export type GetConversationContextUsageResponse = {
  model: SupportedModel;
  contextUsage: number;
  contextSize: number;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetConversationContextUsageResponse>
  >,
  auth: Authenticator
): Promise<void> {
  const { cId } = req.query;
  if (!isString(cId)) {
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
      const conversation = await ConversationResource.fetchById(auth, cId);
      if (!conversation) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "conversation_not_found",
            message: "Conversation not found.",
          },
        });
      }

      const [lastAgentRun, lastCompactionRun] = await Promise.all([
        conversation.getLatestAgentMessageRun(auth),
        conversation.getLatestCompactionMessageRun(auth),
      ]);

      if (
        lastCompactionRun &&
        lastCompactionRun.rank >= (lastAgentRun?.rank || 0)
      ) {
        // If the lastest run is a compaction run we provide a best guess estimate of the context
        // usage with the compaction generated tokens. This misses the system prompt context usage
        // but this will recover at the next agent message and allow us in a somewhat hacky but
        // minimal way to show reduciton of context usage as soon as possible.
        const usages = await lastCompactionRun.run.listRunUsages(auth);
        if (usages.length === 0) {
          return apiError(req, res, {
            status_code: 404,
            api_error: {
              type: "conversation_context_usage_not_found",
              message: "No run usage found for the latest conversation run.",
            },
          });
        }

        const maxUsage = usages.reduce((max, u) =>
          u.completionTokens > max.completionTokens ? u : max
        );

        const modelConfig = getModelConfigByModelId(maxUsage.modelId);

        return res.status(200).json({
          model: {
            providerId: maxUsage.providerId,
            modelId: maxUsage.modelId,
          },
          contextUsage: maxUsage.completionTokens,
          contextSize: modelConfig?.contextSize ?? 0,
        });
      } else {
        if (!lastAgentRun) {
          return apiError(req, res, {
            status_code: 404,
            api_error: {
              type: "conversation_context_usage_not_found",
              message: "Conversation has no run data.",
            },
          });
        }

        const usages = await lastAgentRun.run.listRunUsages(auth);
        if (usages.length === 0) {
          return apiError(req, res, {
            status_code: 404,
            api_error: {
              type: "conversation_context_usage_not_found",
              message: "No run usage found for the latest conversation run.",
            },
          });
        }

        // Take the max promptTokens across usages of the latest run — this represents the peak
        // context usage as seen by the model.
        const maxUsage = usages.reduce((max, u) =>
          u.promptTokens > max.promptTokens ? u : max
        );
        const modelConfig = getModelConfigByModelId(maxUsage.modelId);

        return res.status(200).json({
          model: {
            providerId: maxUsage.providerId,
            modelId: maxUsage.modelId,
          },
          contextUsage: maxUsage.promptTokens,
          contextSize: modelConfig?.contextSize ?? 0,
        });
      }
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
