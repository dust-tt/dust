/** @ignoreswagger */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { acceptSuggestion } from "@app/lib/butler/accept_suggestion";
import { ConversationButlerSuggestionResource } from "@app/lib/resources/conversation_butler_suggestion_resource";
import type { ConversationResource } from "@app/lib/resources/conversation_resource";
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
  auth: Authenticator,
  { conversation }: { conversation: ConversationResource }
): Promise<void> {
  if (!(typeof req.query.sId === "string")) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid query parameters, `sId` (string) is required.",
      },
    });
  }

  const suggestionSId = req.query.sId;

  const suggestion = await ConversationButlerSuggestionResource.fetchById(
    auth,
    suggestionSId
  );
  if (!suggestion || suggestion.conversationId !== conversation.id) {
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
          conversationId: conversation.sId,
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

export default withSessionAuthenticationForWorkspace(
  withResourceFetchingFromRoute(handler, { conversation: {} })
);
