/** @ignoreswagger */
// @migration-status: MIGRATED_TO_HONO
import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import type { GlobalAgentFeedbackItem } from "@app/lib/api/poke/global_agent_feedbacks";
import { listGlobalAgentFeedbacks } from "@app/lib/api/poke/global_agent_feedbacks";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";

export interface GetGlobalAgentFeedbacksResponseBody {
  feedbacks: GlobalAgentFeedbackItem[];
  hasMore: boolean;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetGlobalAgentFeedbacksResponseBody>
  >,
  session: SessionWithUser
): Promise<void> {
  const auth = await Authenticator.fromSuperUserSession(session, null);

  if (!auth.isDustSuperUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "user_not_found",
        message: "Could not find the user.",
      },
    });
  }

  if (req.method !== "GET") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, GET is expected.",
      },
    });
  }

  const { includeEmpty, lastId } = req.query;
  const parsedLastId = isString(lastId) ? parseInt(lastId, 10) : undefined;

  const result = await listGlobalAgentFeedbacks({
    includeEmpty: includeEmpty === "true",
    lastId: parsedLastId,
  });

  return res.status(200).json(result);
}

export default withSessionAuthenticationForPoke(handler);
