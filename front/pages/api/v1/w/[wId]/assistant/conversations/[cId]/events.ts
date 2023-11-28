import { NextApiRequest, NextApiResponse } from "next";

import { getConversationWithoutContent } from "@app/lib/api/assistant/conversation";
import { getConversationEvents } from "@app/lib/api/assistant/pubsub";
import { Authenticator, getAPIKey } from "@app/lib/auth";
import { ReturnedAPIErrorType } from "@app/lib/error";
import { apiError, withLogging } from "@app/logger/withlogging";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ReturnedAPIErrorType>
): Promise<void> {
  const keyRes = await getAPIKey(req);
  if (keyRes.isErr()) {
    return apiError(req, res, keyRes.error);
  }

  const { auth, keyWorkspaceId } = await Authenticator.fromKey(
    keyRes.value,
    req.query.wId as string
  );

  if (!auth.isBuilder() || keyWorkspaceId !== req.query.wId) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "The Assistant API is only available on your own workspace.",
      },
    });
  }

  const conversation = await getConversationWithoutContent(
    auth,
    req.query.cId as string
  );
  if (!conversation) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "conversation_not_found",
        message: "Conversation not found.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });

      for await (const event of getConversationEvents(conversation.sId, null)) {
        res.write(JSON.stringify(event));
        // @ts-expect-error we need to flush for streaming but TS thinks flush() does not exists.
        res.flush();
      }
      res.write("data: done\n\n");
      // @ts-expect-error - We need it for streaming but it does not exists in the types.
      res.flush();

      res.end();
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

export default withLogging(handler, true);
