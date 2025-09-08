import type { NextApiRequest, NextApiResponse } from "next";

import { apiErrorForConversation } from "@app/lib/api/assistant/conversation/helper";
import { fetchConversationParticipants } from "@app/lib/api/assistant/participants";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { ConversationParticipantModel } from "@app/lib/models/assistant/conversation";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { apiError } from "@app/logger/withlogging";
import type {
  ConversationParticipantsType,
  UserMessageType,
  WithAPIErrorResponse,
} from "@app/types";
import { ConversationError } from "@app/types";

export type FetchConversationParticipantsResponse = {
  participants: ConversationParticipantsType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      { message: UserMessageType } | FetchConversationParticipantsResponse
    >
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

  const conversationId = req.query.cId;
  const conversationRes =
    await ConversationResource.fetchConversationWithoutContent(
      auth,
      conversationId
    );

  if (conversationRes.isErr()) {
    return apiErrorForConversation(req, res, conversationRes.error);
  }

  const conversationWithoutContent = conversationRes.value;

  switch (req.method) {
    case "GET":
      const participantsRes = await fetchConversationParticipants(
        auth,
        conversationWithoutContent
      );
      if (participantsRes.isErr()) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "conversation_not_found",
            message: "Conversation not found",
          },
        });
      }

      res.status(200).json({ participants: participantsRes.value });
      break;

    case "POST":
      const user = auth.user();
      if (!user) {
        return apiError(req, res, {
          status_code: 401,
          api_error: {
            type: "app_auth_error",
            message: "User not authenticated",
          },
        });
      }

      const owner = auth.workspace();
      if (!owner) {
        return apiError(req, res, {
          status_code: 401,
          api_error: {
            type: "app_auth_error",
            message: "Workspace not found",
          },
        });
      }

      const existingParticipant = await ConversationParticipantModel.findOne({
        where: {
          conversationId: conversationWithoutContent.id,
          workspaceId: owner.id,
          userId: user.id,
        },
      });

      if (existingParticipant !== null) {
        return apiErrorForConversation(
          req,
          res,
          new ConversationError("user_already_participant")
        );
      }

      await ConversationParticipantModel.create({
        conversationId: conversationWithoutContent.id,
        workspaceId: owner.id,
        userId: user.id,
        action: "subscribed",
        unread: false,
        actionRequired: false,
      });

      res.status(201).end();
      break;

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET or POST is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
