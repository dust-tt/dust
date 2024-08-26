import type { WithAPIErrorResponse } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { Authenticator } from "@app/lib/auth";
import { getSession } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { apiError, withLogging } from "@app/logger/withlogging";

/**
 * This function is a wrapper for API routes that require session authentication.
 *
 * @param handler
 * @param param1
 * @returns
 */
export function withSessionAuthentication<T>(
  handler: (
    req: NextApiRequest,
    res: NextApiResponse<WithAPIErrorResponse<T>>,
    session: SessionWithUser
  ) => Promise<void> | void,
  { isStreaming = false }: { isStreaming?: boolean } = {}
) {
  return withLogging(
    async (
      req: NextApiRequest,
      res: NextApiResponse<WithAPIErrorResponse<T>>
    ) => {
      const session = await getSession(req, res);

      if (!session) {
        return apiError(req, res, {
          status_code: 401,
          api_error: {
            type: "not_authenticated",
            message:
              "The user does not have an active session or is not authenticated",
          },
        });
      }

      return handler(req, res, session);
    },
    isStreaming
  );
}

/**
 * This function is a wrapper for API routes that require session authentication for a workspace.
 * It must be used on all routes that require workspace authentication (prefix: /w/[wId/]).
 *
 * opts.allowNonWorksaceUser allows the handler to be called even if the user is not a member of the
 * workspace. This is useful for routes that share data across workspaces (eg apps runs).
 *
 * @param handler
 * @param opts
 * @returns
 */
export function withSessionAuthenticationForWorkspace<T>(
  handler: (
    req: NextApiRequest,
    res: NextApiResponse<WithAPIErrorResponse<T>>,
    auth: Authenticator,
    session: SessionWithUser
  ) => Promise<void> | void,
  opts: {
    isStreaming?: boolean;
    allowUserOutsideCurrentWorkspace?: boolean;
  } = {}
) {
  return withSessionAuthentication(
    async (
      req: NextApiRequest,
      res: NextApiResponse<WithAPIErrorResponse<T>>,
      session: SessionWithUser
    ) => {
      const { wId } = req.query;
      if (typeof wId !== "string" || !wId) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "workspace_not_found",
            message: "The workspace was not found.",
          },
        });
      }

      const auth = await Authenticator.fromSession(session, wId);

      const owner = auth.workspace();
      const plan = auth.plan();
      if (!owner || !plan) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "workspace_not_found",
            message: "The workspace was not found.",
          },
        });
      }

      const user = auth.user();
      if (!user) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "workspace_user_not_found",
            message: "Could not find the user of the current session.",
          },
        });
      }

      // If allowNonWorksaceUser is not set or false then we check that the user is a member of the
      // workspace.
      if (!auth.isUser() && !opts.allowUserOutsideCurrentWorkspace) {
        return apiError(req, res, {
          status_code: 401,
          api_error: {
            type: "workspace_auth_error",
            message: "Only users of the workspace can access this route.",
          },
        });
      }

      return handler(req, res, auth, session);
    },
    opts
  );
}
