import type { NextApiRequest, NextApiResponse } from "next";

import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { apiError, withLogging } from "@app/logger/withlogging";
import type {
  LightWorkspaceType,
  SubscriptionType,
  UserType,
  WithAPIErrorResponse,
} from "@app/types";
import { isString } from "@app/types";

export type GetAuthContextResponseType =
  | {
      user: UserType;
      workspace: LightWorkspaceType;
      subscription: SubscriptionType;
      isAdmin: boolean;
      isBuilder: boolean;
    }
  | { user: null };

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetAuthContextResponseType>>,
  { session }: { session: SessionWithUser | null }
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

  // No session = not authenticated
  if (!session) {
    return res.status(200).json({ user: null });
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

  const auth = await Authenticator.fromSession(session, wId);
  const workspace = auth.workspace();
  const subscription = auth.subscription();
  const user = auth.user();

  if (!workspace || !subscription || !user) {
    // User is not a member of this workspace
    return res.status(200).json({ user: null });
  }

  return res.status(200).json({
    user: user.toJSON(),
    workspace,
    subscription,
    isAdmin: auth.isAdmin(),
    isBuilder: auth.isBuilder(),
  });
}

export default withLogging(handler);
