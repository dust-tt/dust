import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import { getWorkspaceRegionRedirect } from "@app/lib/api/regions/lookup";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { SubscriptionType } from "@app/types/plan";
import { isString } from "@app/types/shared/utils/general";
import type { LightWorkspaceType, UserType } from "@app/types/user";
import type { NextApiRequest, NextApiResponse } from "next";

export type GetPokeWorkspaceAuthContextResponseType = {
  user: UserType;
  workspace: LightWorkspaceType;
  subscription: SubscriptionType;
  isAdmin: true; // Superusers have admin privileges
  isBuilder: true; // Superusers have builder privileges
  isSuperUser: true;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetPokeWorkspaceAuthContextResponseType>
  >,
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

  const auth = await Authenticator.fromSuperUserSession(session, wId);
  const workspace = auth.workspace();
  const subscription = auth.subscription();
  const userResource = auth.getNonNullableUser();

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

  return res.status(200).json({
    user: userResource.toJSON(),
    workspace,
    subscription,
    isAdmin: true,
    isBuilder: true,
    isSuperUser: true,
  });
}

export default withSessionAuthenticationForPoke(handler);
