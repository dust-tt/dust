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
  opts: { isStreaming?: boolean } = {}
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

      return handler(req, res, auth, session);
    },
    opts
  );
}

/**
 * This function is a wrapper for API routes that require session authentication for a workspace.
 * Ensuring the user is a valid member of the workspace.
 * Ideal for routes that require workspace-specific access control (e.g., /w/[wId]/).
 *
 * @param handler
 * @param opts
 * @returns
 */
export function withSessionAuthenticationForWorkspaceAsUser<T>(
  handler: (
    req: NextApiRequest,
    res: NextApiResponse<WithAPIErrorResponse<T>>,
    auth: Authenticator,
    session: SessionWithUser
  ) => Promise<void> | void,
  opts: { isStreaming?: boolean } = {}
) {
  return withSessionAuthenticationForWorkspace(
    async (
      req: NextApiRequest,
      res: NextApiResponse<WithAPIErrorResponse<T>>,
      auth: Authenticator,
      session: SessionWithUser
    ) => {
      if (!auth.isUser()) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "workspace_auth_error",
            message:
              "User is not a member of the workspace and does not have access.",
          },
        });
      }

      return handler(req, res, auth, session);
    },
    opts
  );
}
