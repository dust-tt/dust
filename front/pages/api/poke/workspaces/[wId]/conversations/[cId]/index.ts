import type {
  PokeConversationType,
  WithAPIErrorResponse,
} from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { apiErrorForConversation } from "@app/lib/api/assistant/conversation/helper";
import { withSessionAuthentication } from "@app/lib/api/auth_wrappers";
import { Authenticator, getSession } from "@app/lib/auth";
import { getPokeConversation } from "@app/lib/poke/conversations";
import { apiError } from "@app/logger/withlogging";

export type GetConversationResponseBody = {
  conversation: PokeConversationType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetConversationResponseBody>>
): Promise<void> {
  const session = await getSession(req, res);
  const auth = await Authenticator.fromSuperUserSession(
    session,
    req.query.wId as string
  );

  if (!auth.isDustSuperUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "user_not_found",
        message: "Could not find the user.",
      },
    });
  }

  const { cId } = req.query;
  if (!cId || typeof cId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "The request query is invalid, expects { cId: string }.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const conversationRes = await getPokeConversation(auth, cId, true);

      if (conversationRes.isErr()) {
        return apiErrorForConversation(req, res, conversationRes.error);
      }

      const conversation = conversationRes.value;

      return res.status(200).json({ conversation });

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

export default withSessionAuthentication(handler);
