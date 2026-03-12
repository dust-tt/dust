import { apiErrorForConversation } from "@app/lib/api/assistant/conversation/helper";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { acceptSuggestion } from "@app/lib/butler/accept_suggestion";
import { ConversationButlerSuggestionResource } from "@app/lib/resources/conversation_butler_suggestion_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { apiError } from "@app/logger/withlogging";
import type { ButlerSuggestionPublicType } from "@app/types/conversation_butler_suggestion";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";

export type PatchButlerSuggestionResponse = {
  suggestion: ButlerSuggestionPublicType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PatchButlerSuggestionResponse>>,
  auth: Authenticator
): Promise<void> {
  if (
    !(typeof req.query.cId === "string") ||
    !(typeof req.query.sId === "string")
  ) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message:
          "Invalid query parameters, `cId` and `sId` (strings) are required.",
      },
    });
  }

  const conversationId = req.query.cId;
  const suggestionSId = req.query.sId;

  const conversationRes =
    await ConversationResource.fetchConversationWithoutContent(
      auth,
      conversationId
    );
  if (conversationRes.isErr()) {
    return apiErrorForConversation(req, res, conversationRes.error);
  }

  const suggestion = await ConversationButlerSuggestionResource.fetchById(
    auth,
    suggestionSId
  );
  if (!suggestion || suggestion.conversationId !== conversationRes.value.id) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "invalid_request_error",
        message: "The butler suggestion was not found.",
      },
    });
  }

  switch (req.method) {
    case "PATCH": {
      const { status } = req.body as { status?: string };
      if (status !== "accepted" && status !== "dismissed") {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              'Invalid body, `status` must be "accepted" or "dismissed".',
          },
        });
      }

      if (status === "accepted") {
        const acceptRes = await acceptSuggestion(auth, {
          suggestion,
          conversationId,
        });
        if (acceptRes.isErr()) {
          return apiError(req, res, {
            status_code: 500,
            api_error: {
              type: "internal_server_error",
              message: acceptRes.error.message,
            },
          });
        }
      } else {
        const dismissRes = await suggestion.dismiss(auth);
        if (dismissRes.isErr()) {
          return apiError(req, res, {
            status_code: 403,
            api_error: {
              type: "invalid_request_error",
              message: dismissRes.error.message,
            },
          });
        }
      }

      res.status(200).json({
        suggestion: suggestion.toJSON(),
      });
      return;
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, PATCH is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
