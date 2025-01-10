import type { WithAPIErrorResponse } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { apiErrorForConversation } from "@app/lib/api/assistant/conversation/helper";
import { getConversationWithoutContent } from "@app/lib/api/assistant/conversation/without_content";
import { cancelMessageGenerationEvent } from "@app/lib/api/assistant/pubsub";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";

export type PostMessageEventResponseBody = {
  success: true;
};
const PostMessageEventBodySchema = t.type({
  action: t.literal("cancel"),
  messageIds: t.array(t.string),
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PostMessageEventResponseBody>>,
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

  switch (req.method) {
    case "POST":
      const bodyValidation = PostMessageEventBodySchema.decode(req.body);
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
      await cancelMessageGenerationEvent(bodyValidation.right.messageIds);
      return res.status(200).json({ success: true });

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

export default withSessionAuthenticationForWorkspace(handler, {
  isStreaming: true,
});
