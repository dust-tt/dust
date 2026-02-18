import {
  deleteOrLeaveConversation,
  updateConversationTitle,
} from "@app/lib/api/assistant/conversation";
import { apiErrorForConversation } from "@app/lib/api/assistant/conversation/helper";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { moveConversationToProject } from "@app/lib/api/projects/conversations";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { apiError } from "@app/logger/withlogging";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type { WithAPIErrorResponse } from "@app/types/error";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { isString } from "@app/types/shared/utils/general";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

const PatchConversationsRequestBodySchema = t.union([
  t.type({
    title: t.string,
  }),
  t.type({
    read: t.literal(true),
  }),
  t.type({
    spaceId: t.string,
  }),
]);

export type PatchConversationsRequestBody = t.TypeOf<
  typeof PatchConversationsRequestBodySchema
>;

export type GetConversationResponseBody = {
  conversation: ConversationWithoutContentType;
};

export type PatchConversationResponseBody = {
  success: boolean;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      GetConversationResponseBody | PatchConversationResponseBody | void
    >
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
      const canAccess = await ConversationResource.canAccess(auth, cId);
      if (canAccess !== "allowed") {
        return apiError(req, res, {
          status_code: canAccess === "conversation_not_found" ? 404 : 403,
          api_error: {
            type: canAccess,
            message:
              canAccess === "conversation_not_found"
                ? "Conversation not found."
                : "You don't have access to this conversation.",
          },
        });
      }
      const conversationRes =
        await ConversationResource.fetchConversationWithoutContent(auth, cId);

      if (conversationRes.isErr()) {
        return apiErrorForConversation(req, res, conversationRes.error);
      }

      const conversation = conversationRes.value;
      res.status(200).json({ conversation });
      return;
    }

    case "DELETE": {
      const { forceDelete } = req.query;
      const result = await deleteOrLeaveConversation(auth, {
        conversationId: cId,
        forceDelete: forceDelete === "true",
      });
      if (result.isErr()) {
        return apiErrorForConversation(req, res, result.error);
      }

      res.status(200).end();
      return;
    }

    case "PATCH":
      {
        const conversationRes =
          await ConversationResource.fetchConversationWithoutContent(auth, cId);

        if (conversationRes.isErr()) {
          return apiErrorForConversation(req, res, conversationRes.error);
        }

        const conversation = conversationRes.value;
        const bodyValidation = PatchConversationsRequestBodySchema.decode(
          req.body
        );

        if (isLeft(bodyValidation)) {
          const pathError = reporter.formatValidationErrors(
            bodyValidation.left
          );

          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: `Invalid request body: ${pathError}`,
            },
          });
        }

        if ("title" in bodyValidation.right) {
          const result = await updateConversationTitle(auth, {
            conversationId: conversation.sId,
            title: bodyValidation.right.title,
          });
          await ConversationResource.markAsReadForAuthUser(auth, {
            conversation,
          });

          if (result.isErr()) {
            return apiErrorForConversation(req, res, result.error);
          }
          return res.status(200).json({ success: true });
        } else if ("read" in bodyValidation.right) {
          await ConversationResource.markAsReadForAuthUser(auth, {
            conversation,
          });

          return res.status(200).json({ success: true });
        } else if ("spaceId" in bodyValidation.right) {
          const r = await moveConversationToProject(auth, {
            conversation,
            spaceId: bodyValidation.right.spaceId,
          });
          if (r.isOk()) {
            return res.status(200).json({ success: true });
          } else {
            switch (r.error.code) {
              case "unauthorized":
                return apiError(req, res, {
                  status_code: 404,
                  api_error: {
                    type: "user_not_found",
                    message: r.error.message,
                  },
                });
              case "space_not_found":
                return apiError(req, res, {
                  status_code: 404,
                  api_error: {
                    type: "space_not_found",
                    message: "Space not found",
                  },
                });
              case "conversation_not_found":
                return apiError(req, res, {
                  status_code: 404,
                  api_error: {
                    type: "conversation_not_found",
                    message: "Conversation not found",
                  },
                });
              case "internal_error":
                return apiError(req, res, {
                  status_code: 500,
                  api_error: {
                    type: "internal_server_error",
                    message: "Internal server error",
                  },
                });
              default:
                assertNever(r.error.code);
            }
          }
        } else {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: "Invalid request body",
            },
          });
        }
      }
      break;

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET, PATCH or DELETE is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
