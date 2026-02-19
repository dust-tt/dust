import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import {
  ADMIN_GROUP_NAME,
  BUILDER_GROUP_NAME,
  GroupResource,
} from "@app/lib/resources/group_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";

export type GetProvisioningStatusResponseBody = {
  hasAdminGroup: boolean;
  hasBuilderGroup: boolean;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetProvisioningStatusResponseBody>>,
  auth: Authenticator
): Promise<void> {
  switch (req.method) {
    case "GET":
      const r =
        await GroupResource.listRoleProvisioningGroupsForWorkspace(auth);
      return res.status(200).json({
        hasAdminGroup: r.some((g) => g.name === ADMIN_GROUP_NAME),
        hasBuilderGroup: r.some((g) => g.name === BUILDER_GROUP_NAME),
      });

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

export default withSessionAuthenticationForWorkspace(handler);
