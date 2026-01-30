import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthentication } from "@app/lib/api/auth_wrappers";
import type { RegionType } from "@app/lib/api/regions/config";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { getUserFromSession } from "@app/lib/iam/session";
import { apiError } from "@app/logger/withlogging";
import type { UserTypeWithWorkspaces, WithAPIErrorResponse } from "@app/types";

export type GetNoWorkspaceAuthContextResponseType = {
  user: UserTypeWithWorkspaces;
  region: RegionType;
  defaultWorkspaceId: string | null;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetNoWorkspaceAuthContextResponseType>
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

  const user = await getUserFromSession(session);

  if (!user) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "not_authenticated",
        message: "User not authenticated.",
      },
    });
  }

  return res.status(200).json({
    user,
    region: session.region,
    defaultWorkspaceId: session.workspaceId ?? null,
  });
}

export default withSessionAuthentication(handler);
