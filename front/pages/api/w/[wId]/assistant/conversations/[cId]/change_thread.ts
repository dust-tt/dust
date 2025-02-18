import type {
  ConversationWithoutContentType,
  WithAPIErrorResponse,
} from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { apiErrorForConversation } from "@app/lib/api/assistant/conversation/helper";
import { getConversationWithoutContent } from "@app/lib/api/assistant/conversation/without_content";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { Conversation, Message } from "@app/lib/models/assistant/conversation";
import { apiError } from "@app/logger/withlogging";

export type GetConversationsResponseBody = {
  conversation: ConversationWithoutContentType;
};

const PostChangeThreadBodySchema = t.type({
  id: t.string,
  direction: t.union([t.literal("previous"), t.literal("next")]),
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<{ success: boolean }>>,
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
  const workspace = auth.getNonNullableWorkspace();
  const conversationRes = await getConversationWithoutContent(
    auth,
    req.query.cId
  );

  if (conversationRes.isErr()) {
    return apiErrorForConversation(req, res, conversationRes.error);
  }

  const conversation = conversationRes.value;

  switch (req.method) {
    case "POST": {
      const bodyValidation = PostChangeThreadBodySchema.decode(req.body);

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

      const { id, direction } = bodyValidation.right;
      const message = await Message.findOne({
        where: {
          workspaceId: workspace.id,
          sId: id,
          conversationId: conversation.id,
        },
      });

      if (!message) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: message not found`,
          },
        });
      }

      const newMessageId =
        direction === "next"
          ? message.nextVersionMessageId
          : message.previousVersionMessageId;

      if (!newMessageId) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: no message`,
          },
        });
      }

      const newMessage = await Message.findOne({
        where: {
          id: newMessageId,
          workspaceId: workspace.id,
          conversationId: conversation.id,
        },
      });
      if (!newMessage) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: no message`,
          },
        });
      }

      await Conversation.update(
        {
          currentThreadVersion: newMessage.threadVersions[0],
        },
        {
          where: { id: conversation.id },
        }
      );
      return res.status(200).json({ success: true });
    }

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
