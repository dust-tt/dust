import type {
  ConversationWithoutContentType,
  WithAPIErrorResponse,
} from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";
import { Op } from "sequelize";

import {
  deleteConversation,
  updateConversation,
} from "@app/lib/api/assistant/conversation";
import { apiErrorForConversation } from "@app/lib/api/assistant/conversation/helper";
import { getConversationWithoutContent } from "@app/lib/api/assistant/conversation/without_content";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { Conversation, Message } from "@app/lib/models/assistant/conversation";
import { apiError } from "@app/logger/withlogging";

export const PatchConversationsRequestBodySchema = t.type({
  title: t.union([t.string, t.null]),
  visibility: t.union([
    t.literal("unlisted"),
    t.literal("workspace"),
    t.literal("deleted"),
    t.literal("test"),
  ]),
});

export type GetConversationsResponseBody = {
  conversation: ConversationWithoutContentType;
};

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
      const { id, direction } = req.query;
      const message = await Message.findOne({
        where: {
          sId: id,
          conversationId: conversation.id,
        },
      });

      if (message && message.nextVersionMessageId && direction === "next") {
        const next = await Message.findOne({
          where: { id: message.nextVersionMessageId },
        });
        if (next) {
          await Conversation.update(
            {
              currentThreadVersion: next.threadVersions[0],
            },
            {
              where: { id: conversation.id },
            }
          );
        }
      }
      if (
        message &&
        message.previousVersionMessageId &&
        direction === "previous"
      ) {
        const previous = await Message.findOne({
          where: { id: message.previousVersionMessageId },
        });
        if (previous) {
          await Conversation.update(
            {
              currentThreadVersion: previous.threadVersions[0],
            },
            {
              where: { id: conversation.id },
            }
          );
        }
      }
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
