/** @ignoreswagger */
import {
  dismissMention,
  validateUserMention,
} from "@app/lib/api/assistant/conversation/mentions";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import type { ConversationResource } from "@app/lib/resources/conversation_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

const PostMentionActionRequestBodySchema = t.type({
  type: t.union([t.literal("agent"), t.literal("user")]),
  id: t.string,
  action: t.union([
    t.literal("approved"),
    t.literal("rejected"),
    t.literal("dismissed"),
  ]),
});

export type PostMentionActionRequestBody = t.TypeOf<
  typeof PostMentionActionRequestBodySchema
>;

export type PostMentionActionResponseBody = {
  success: boolean;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PostMentionActionResponseBody>>,
  auth: Authenticator,
  { conversation }: { conversation: ConversationResource }
): Promise<void> {
  const { mId } = req.query;

  if (!isString(mId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid query parameters, `mId` (string) is required.",
      },
    });
  }

  switch (req.method) {
    case "POST": {
      const bodyValidation = PostMentionActionRequestBodySchema.decode(
        req.body
      );

      if (isLeft(bodyValidation)) {
        const pathError = reporter.formatValidationErrors(bodyValidation.left);

        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${pathError}`,
          },
        });
      }
      const { type, id, action } = bodyValidation.right;

      if (action === "dismissed") {
        const dismissMentionRes = await dismissMention(auth, {
          conversationId: conversation.sId,
          messageId: mId,
          type,
          id,
        });
        if (dismissMentionRes.isErr()) {
          return apiError(req, res, dismissMentionRes.error);
        }
      } else {
        if (type !== "user") {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: "Only user mentions are supported.",
            },
          });
        }

        const validateUserMentionRes = await validateUserMention(auth, {
          conversationId: conversation.sId,
          userId: id,
          messageId: mId,
          approvalState: action,
        });

        if (validateUserMentionRes.isErr()) {
          return apiError(req, res, validateUserMentionRes.error);
        }
      }

      res.status(200).json({
        success: true,
      });
      return;
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

export default withSessionAuthenticationForWorkspace(
  withResourceFetchingFromRoute(handler, { conversation: {} })
);
