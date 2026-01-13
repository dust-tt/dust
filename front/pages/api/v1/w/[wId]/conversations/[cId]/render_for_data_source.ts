import type { PostRenderConversationForDataSourceResponseType } from "@dust-tt/client";
import type { NextApiRequest, NextApiResponse } from "next";

import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { renderConversationForModel } from "@app/lib/api/assistant/conversation_rendering";
import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { GPT_4_TURBO_MODEL_CONFIG, isString } from "@app/types";

/**
 * @ignoreswagger
 * System API key only endpoint. Undocumented.
 */

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<PostRenderConversationForDataSourceResponseType>
  >,
  auth: Authenticator
): Promise<void> {
  const { wId, cId } = req.query;
  if (!isString(wId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Missing or invalid workspace id.",
      },
    });
  }
  if (!isString(cId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Missing or invalid conversation id.",
      },
    });
  }

  // Only allow system keys (connectors) to access this endpoint
  if (!auth.isSystemKey()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "invalid_oauth_token_error",
        message: "Only system keys are allowed to use this endpoint.",
      },
    });
  }

  switch (req.method) {
    case "POST": {
      const { excludeActions, excludeImages } = req.body as {
        excludeActions?: boolean;
        excludeImages?: boolean;
      };

      const conversationRes = await getConversation(auth, cId, true);
      if (conversationRes.isErr()) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "conversation_not_found",
            message: conversationRes.error.message,
          },
        });
      }
      const conversation = conversationRes.value;

      // Use GPT-4 Turbo as default model for rendering (large context window)
      const model = GPT_4_TURBO_MODEL_CONFIG;

      // For data source syncing, we want to render the full conversation
      // Use a large token budget to include as much as possible
      const MIN_GENERATION_TOKENS = 2048;
      const allowedTokenCount = model.contextSize - MIN_GENERATION_TOKENS;

      // Empty prompt and tools since we're just rendering for indexing, not generation
      const prompt = "";
      const tools = "";

      const convoRes = await renderConversationForModel(auth, {
        conversation,
        model,
        prompt,
        tools,
        allowedTokenCount,
        excludeActions,
        excludeImages,
        onMissingAction: "skip",
      });

      //TODO(project): transform & filter the json to something more appropriate as a data source document

      if (convoRes.isErr()) {
        logger.error(
          {
            workspaceId: wId,
            conversationId: cId,
            error: convoRes.error,
          },
          "[RenderConversationForDataSource] Failed to render conversation"
        );
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: `Failed to render conversation: ${convoRes.error.message}`,
          },
        });
      }

      const { modelConversation, tokensUsed } = convoRes.value;

      logger.info(
        {
          workspaceId: wId,
          conversationId: cId,
          tokensUsed,
          messageCount: modelConversation.messages.length,
        },
        "[RenderConversationForDataSource] Successfully rendered conversation"
      );

      return res.status(200).json({
        messages: modelConversation.messages,
        tokensUsed,
      });
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, POST is expected.",
        },
      });
  }
}

export default withPublicAPIAuthentication(handler);
