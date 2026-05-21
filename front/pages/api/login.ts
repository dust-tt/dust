// @migration-status: MIGRATED_TO_HONO

/** @ignoreswagger */
import { withSessionAuthentication } from "@app/lib/api/auth_wrappers";
import { performLogin } from "@app/lib/api/login";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { extractUTMParams } from "@app/lib/utils/utm";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<void>>,
  session: SessionWithUser
): Promise<void> {
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

  const outcome = await performLogin(
    {
      cookieHeader: req.headers.cookie,
      forwardedFor: req.headers["x-forwarded-for"],
      remoteAddress: req.socket?.remoteAddress,
    },
    session,
    {
      inviteToken: isString(inviteToken) ? inviteToken : null,
      wId: isString(wId) ? wId : null,
      utmParams: extractUTMParams(req.query),
      join: join === "true",
      conversationId: isString(cId) ? cId : null,
      returnTo: null,
    }
  );

  switch (outcome.kind) {
    case "redirect":
      res.redirect(outcome.url);
      return;
    case "unauthorized":
      res.status(401).end();
      return;
    case "apiError":
      return apiError(req, res, outcome.error);
    default:
      assertNever(outcome);
  }
}

export default withSessionAuthentication(handler);
