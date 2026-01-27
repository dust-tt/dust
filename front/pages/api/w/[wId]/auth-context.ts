import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { apiError } from "@app/logger/withlogging";
import type {
  LightWorkspaceType,
  SubscriptionType,
  UserType,
  WithAPIErrorResponse,
} from "@app/types";

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

  const user = auth.getNonNullableUser();
  const workspace = auth.getNonNullableWorkspace();
  const subscription = auth.getNonNullableSubscription();

  return res.status(200).json({
    user: user.toJSON(),
    workspace,
    subscription,
    isAdmin: auth.isAdmin(),
    isBuilder: auth.isBuilder(),
  });
}

export default withSessionAuthenticationForWorkspace(handler);
