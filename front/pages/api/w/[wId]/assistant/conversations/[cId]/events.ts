import type { WithAPIErrorResponse } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { apiErrorForConversation } from "@app/lib/api/assistant/conversation/helper";
import { getConversationWithoutContent } from "@app/lib/api/assistant/conversation/without_content";
import { getConversationEvents } from "@app/lib/api/assistant/pubsub";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<void>>,
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
  const conversationRes = await getConversationWithoutContent(
    auth,
    conversationId
  );

  if (conversationRes.isErr()) {
    return apiErrorForConversation(req, res, conversationRes.error);
  }

  const conversation = conversationRes.value;

  const lastEventId = req.query.lastEventId || null;
  if (lastEventId && typeof lastEventId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message:
          "Invalid query parameters, `lastEventId` should be string if specified.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const eventStream = getConversationEvents(conversation.sId, lastEventId);

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.flushHeaders();

      for await (const event of eventStream) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
        // @ts-expect-error - We need it for streaming but it does not exists in the types.
        res.flush();
      }
      res.write("data: done\n\n");
      // @ts-expect-error - We need it for streaming but it does not exists in the types.
      res.flush();

      res.status(200).end();
      return;
    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler, {
  isStreaming: true,
});
