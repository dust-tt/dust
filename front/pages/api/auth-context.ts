import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { RegionType } from "@app/lib/api/regions/config";
import { lookupWorkspace } from "@app/lib/api/regions/lookup";
import type { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { apiError } from "@app/logger/withlogging";
import type {
  LightWorkspaceType,
  UserType,
  WithAPIErrorResponse,
} from "@app/types";

export type GetNoWorkspaceAuthContextResponseType = {
  user: UserType | null;
  region: RegionType | null;
  defaultWorkspace: LightWorkspaceType | null;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetNoWorkspaceAuthContextResponseType>
  >,
  auth: Authenticator,
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

  const userResource = auth.getNonNullableUser();
  let defaultWorkspace: LightWorkspaceType | null = null;
  if (session.workspaceId) {
    const lookupRes = await lookupWorkspace(session.workspaceId);
    if (lookupRes.isErr()) {
      return apiError(req, res, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Can't lookup workspace.",
        },
      });
    }

    defaultWorkspace = lookupRes.value?.workspace ?? null;
  }

  // If we reach here, user is a superuser (withSessionAuthenticationForPoke checks this)
  return res.status(200).json({
    user: userResource.toJSON(),
    region: session.region,
    defaultWorkspace,
  });
}

export default withSessionAuthenticationForWorkspace(handler);
