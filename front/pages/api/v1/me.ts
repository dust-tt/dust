import type {
  UserTypeWithWorkspaces,
  WithAPIErrorResponse,
} from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { getUserFromAuth0Token } from "@app/lib/api/auth0";
import { getUserWithWorkspaces } from "@app/lib/api/user";
import { getAuthType, getBearerToken } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";

export type MeResponseBody = {
  user: UserTypeWithWorkspaces;
};

/**
 * @ignoreswagger
 * WIP, undocumented.
 * TODO(EXT): Document this endpoint.
 */

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<MeResponseBody>>
): Promise<void> {
  switch (req.method) {
    case "GET":
      const bearerTokenRes = await getBearerToken(req);
      if (bearerTokenRes.isErr()) {
        return apiError(req, res, {
          status_code: 401,
          api_error: {
            type: "not_authenticated",
            message:
              "The request does not have valid authentication credentials.",
          },
        });
      }
      const bearerToken = bearerTokenRes.value;
      const authMethod = getAuthType(bearerToken);

      if (authMethod !== "access_token") {
        return apiError(req, res, {
          status_code: 401,
          api_error: {
            type: "not_authenticated",
            message:
              "The request does not have valid authentication credentials.",
          },
        });
      }

      const user = await getUserFromAuth0Token(bearerToken);
      if (!user) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "user_not_found",
            message: "Could not find the user.",
          },
        });
      }

      const userWithWorkspaces = await getUserWithWorkspaces(user);

      return res.status(200).json({ user: userWithWorkspaces });

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

// This route is specific, not using the generic wrapper for public API routes.
export default handler;
