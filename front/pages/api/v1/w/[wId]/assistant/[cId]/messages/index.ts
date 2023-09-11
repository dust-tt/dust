import { NextApiRequest, NextApiResponse } from "next";

import { postUserMessageWithPubSub } from "@app/lib/api/assistant/pubsub";
import { Authenticator, getAPIKey } from "@app/lib/auth";
import { ReturnedAPIErrorType } from "@app/lib/error";
import { Conversation } from "@app/lib/models";
import { apiError, withLogging } from "@app/logger/withlogging";
import { UserMessageType } from "@app/types/assistant/conversation";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<UserMessageType | ReturnedAPIErrorType>
): Promise<void> {
  const keyRes = await getAPIKey(req);
  if (keyRes.isErr()) {
    return apiError(req, res, keyRes.error);
  }

  const { auth, keyWorkspaceId } = await Authenticator.fromKey(
    keyRes.value,
    req.query.wId as string
  );

  if (!keyRes.value.isSystem) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message:
          "The Assitant API is only accessible by system API Key. Ping us at team@dust.tt if you want access to it.",
      },
    });
  }

  if (keyWorkspaceId !== req.query.wId) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "The Assistant API is only available on your own workspace.",
      },
    });
  }

  const conv = await Conversation.findOne({
    where: {
      sId: req.query.cId as string,
    },
  });
  if (!conv) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "conversation_not_found",
        message: "Conversation not found.",
      },
    });
  }

  // no time for actual io-ts parsing right now, so here is the expected structure.
  // Will handle proper parsing later.
  const payload = req.body as {
    content: string;
    context: {
      timezone: string;
      username: string;
      fullName: string;
      email: string;
      profilePictureUrl: string;
    };
  };

  switch (req.method) {
    case "POST":
      // Not awaiting this promise on prupose.
      // We want to answer "OK" to the client ASAP and process the events in the background.
      const message = await postUserMessageWithPubSub(auth, {
        conversation: {
          id: conv.id,
          created: conv.createdAt.getTime(),
          sId: conv.sId,
          title: conv.title,
          // not sure how to provide the content here for now.
          content: [],
          visibility: conv.visibility,
        },
        content: payload.content,
        mentions: [],
        context: {
          timezone: payload.context.timezone,
          username: payload.context.username,
          fullName: payload.context.fullName,
          email: payload.context.email,
          profilePictureUrl: payload.context.profilePictureUrl,
        },
      });
      res.status(200).json(message);
      return;

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

export default withLogging(handler);
