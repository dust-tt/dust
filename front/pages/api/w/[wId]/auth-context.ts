import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { getWorkspaceRegionRedirect } from "@app/lib/api/regions/lookup";
import type { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { apiError } from "@app/logger/withlogging";
import type {
  LightWorkspaceType,
  SubscriptionType,
  UserType,
  WithAPIErrorResponse,
} from "@app/types";
import { isString } from "@app/types";

export type GetWorkspaceAuthContextResponseType = {
  user: UserType;
  workspace: LightWorkspaceType;
  subscription: SubscriptionType;
  isAdmin: boolean;
  isBuilder: boolean;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetWorkspaceAuthContextResponseType>
  >,
  auth: Authenticator,
  _session: SessionWithUser
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

  const workspace = auth.workspace();
  const subscription = auth.subscription();

  const { wId } = req.query;
  if (!isString(wId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid workspace ID.",
      },
    });
  }

  // If workspace not found locally, lookup in other region.
  if (!workspace || !subscription) {
    const redirect = await getWorkspaceRegionRedirect(wId);

    if (redirect) {
      return res.status(400).json({
        error: {
          type: "workspace_in_different_region",
          message: "Workspace is located in a different region",
          redirect,
        },
      });
    }

    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "Workspace not found.",
      },
    });
  }

  const user = auth.getNonNullableUser();

  return res.status(200).json({
    user: user.toJSON(),
    workspace,
    subscription,
    isAdmin: auth.isAdmin(),
    isBuilder: auth.isBuilder(),
  });
}

export default withSessionAuthenticationForWorkspace(handler, {
  // Allow the handler to be called even if the workspace is not found.
  // Handler will check if the workspace is found in other regions.
  allowMissingWorkspace: true,
});
