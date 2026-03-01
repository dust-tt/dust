import { CUSTOM_ATTRIBUTES_TO_SYNC, WORKOS_METADATA_KEY_PREFIX } from "@app/lib/iam/users";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserMetadataModel } from "@app/lib/resources/storage/models/user";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";
import { Op } from "sequelize";

const DEPARTMENT_KEY = `${WORKOS_METADATA_KEY_PREFIX}${CUSTOM_ATTRIBUTES_TO_SYNC[1]}`; // department_name

export type GetWorkspaceAnalyticsDepartmentsResponse = {
  departments: string[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetWorkspaceAnalyticsDepartmentsResponse>>,
  auth: Authenticator
) {
  if (!auth.isAdmin()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "Only workspace admins can access analytics departments.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const owner = auth.getNonNullableWorkspace();
      const { memberships } = await MembershipResource.getActiveMemberships({
        workspace: owner,
      });
      const memberUserIds = memberships.map((m) => m.userId);

      if (memberUserIds.length === 0) {
        return res.status(200).json({ departments: [] });
      }

      const rows = await UserMetadataModel.findAll({
        where: {
          workspaceId: owner.id,
          key: DEPARTMENT_KEY,
          userId: { [Op.in]: memberUserIds },
        },
        attributes: ["value"],
        raw: true,
      });

      const departments = [...new Set(rows.map((r) => r.value).filter(Boolean))].sort();
      return res.status(200).json({ departments });
    }
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
