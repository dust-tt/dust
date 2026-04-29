/** @ignoreswagger */
import { performLogin } from "@app/lib/api/login";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { extractUTMParams } from "@app/lib/utils/utm";
import { apiError, withLogging } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<void>>,
  { session }: { session: SessionWithUser | null }
): Promise<void> {
  if (!session) {
    res.status(401).end();
    return;
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

  const { inviteToken, wId, join, cId } = req.query;

  return performLogin(req, res, session, {
    inviteToken: isString(inviteToken) ? inviteToken : null,
    wId: isString(wId) ? wId : null,
    utmParams: extractUTMParams(req.query),
    join: join === "true",
    conversationId: isString(cId) ? cId : null,
    returnTo: null,
  });
}

// Note from seb: Should it be withSessionAuthentication?
export default withLogging(handler);
