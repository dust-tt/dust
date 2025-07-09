import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import {
  deleteConversation,
  updateConversationTitle,
} from "@app/lib/api/assistant/conversation";
import { apiErrorForConversation } from "@app/lib/api/assistant/conversation/helper";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { apiError } from "@app/logger/withlogging";
import type {
  ConversationWithoutContentType,
  WithAPIErrorResponse,
} from "@app/types";

export const PatchConversationsRequestBodySchema = t.type({
  title: t.string,
});

export type GetConversationsResponseBody = {
  conversation: ConversationWithoutContentType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetConversationsResponseBody | void>
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

  const conversationRes =
    await ConversationResource.fetchConversationWithoutContent(
      auth,
      req.query.cId
    );

  if (conversationRes.isErr()) {
    return apiErrorForConversation(req, res, conversationRes.error);
  }

  const conversation = conversationRes.value;

  switch (req.method) {
    case "GET":
      res.status(200).json({ conversation });
      return;

    case "DELETE": {
      const result = await deleteConversation(auth, {
        conversationId: conversation.sId,
      });
      if (result.isErr()) {
        return apiErrorForConversation(req, res, result.error);
      }

      res.status(200).end();
      return;
    }

    case "PATCH": {
      const bodyValidation = PatchConversationsRequestBodySchema.decode(
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

      const { title } = bodyValidation.right;

      const result = await updateConversationTitle(auth, {
        conversationId: conversation.sId,
        title,
      });

      if (result.isErr()) {
        return apiErrorForConversation(req, res, result.error);
      }

      res.status(200).json({ conversation: result.value });
      return;
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
