import type { ApiAppType } from "@dust-tt/client";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthentication } from "@app/lib/api/auth_wrappers";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { importApp } from "@app/lib/utils/apps";
import { apiError } from "@app/logger/withlogging";
import type { AppType, WithAPIErrorResponse } from "@app/types";

/**
 * @ignoreswagger
 * Internal endpoint. Undocumented.
 */
async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<{ app: AppType }>>,
  session: SessionWithUser
) {
  const auth = await Authenticator.fromSuperUserSession(
    session,
    req.query.wId as string
  );
  if (req.method !== "POST") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, POST is expected.",
      },
    });
  }

  const body = req.body;

  const spaceId = req.query.spaceId as string;

  const space = await SpaceResource.fetchById(auth, spaceId);
  if (!space) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Space not found.",
      },
    });
  }

  const result = await importApp(auth, space, body.app as ApiAppType);

  if (result.isErr()) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: result.error.message,
      },
    });
  }

  res.status(200).json({ app: result.value.app.toJSON() });
}

export default withSessionAuthentication(handler);
