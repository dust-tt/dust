/** @ignoreswagger */
// @migration-status: MIGRATED_TO_HONO
import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import { listWorkspacesForPoke } from "@app/lib/api/poke/workspaces";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";

// Re-exported from `lib/api/poke/workspaces` for backward compatibility with
// client imports from `@app/pages/api/poke/workspaces`.
export type {
  ListWorkspacesForPokeParams,
  PokeWorkspaceType,
} from "@app/lib/api/poke/workspaces";

import type { PokeWorkspaceType } from "@app/lib/api/poke/workspaces";

export type GetPokeWorkspacesResponseBody = {
  workspaces: PokeWorkspaceType[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetPokeWorkspacesResponseBody>>,
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

  let listUpgraded: boolean | undefined;
  if (req.query.upgraded !== undefined) {
    if (
      typeof req.query.upgraded !== "string" ||
      !["true", "false"].includes(req.query.upgraded)
    ) {
      return apiError(req, res, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message:
            "The request query is invalid, expects { upgraded: boolean }.",
        },
      });
    }
    listUpgraded = req.query.upgraded === "true";
  }

  let limit = 0;
  if (req.query.limit !== undefined) {
    if (typeof req.query.limit !== "string" || !/^\d+$/.test(req.query.limit)) {
      return apiError(req, res, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "The request query is invalid, expects { limit: number }.",
        },
      });
    }
    limit = parseInt(req.query.limit, 10);
  }

  const searchTerm = req.query.search
    ? decodeURIComponent(req.query.search as string).trim()
    : undefined;

  const workspaces = await listWorkspacesForPoke(auth, {
    listUpgraded,
    searchTerm,
    limit,
  });

  return res.status(200).json({ workspaces });
}

export default withSessionAuthenticationForPoke(handler);
