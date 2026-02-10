import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthentication } from "@app/lib/api/auth_wrappers";
import { fetchRevokedWorkspace } from "@app/lib/api/user";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { getUserFromSession } from "@app/lib/iam/session";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { apiError } from "@app/logger/withlogging";
import type { LightWorkspaceType, WithAPIErrorResponse } from "@app/types";
import { isString } from "@app/types";

export type GetWorkspaceLookupResponseBody = {
  workspace: LightWorkspaceType;
  status: "auto-join-disabled" | "revoked";
  workspaceVerifiedDomain: string | null;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetWorkspaceLookupResponseBody>>,
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
      status_code: 404,
      api_error: {
        type: "user_not_found",
        message: "User not found.",
      },
    });
  }

  const { flow } = req.query;
  if (!isString(flow)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "The flow query parameter is required.",
      },
    });
  }

  let workspace: WorkspaceResource | null = null;
  let workspaceVerifiedDomain: string | null = null;
  let status: "auto-join-disabled" | "revoked";

  if (flow === "no-auto-join") {
    status = "auto-join-disabled";
    const [, userEmailDomain] = user.email.split("@");
    const result =
      await WorkspaceResource.fetchByDomainWithInfo(userEmailDomain);
    workspace = result?.workspace ?? null;
    workspaceVerifiedDomain = result?.domainInfo.domain ?? null;

    if (!workspace || !workspaceVerifiedDomain) {
      return apiError(req, res, {
        status_code: 404,
        api_error: {
          type: "workspace_not_found",
          message: "Workspace not found.",
        },
      });
    }
  } else if (flow === "revoked") {
    status = "revoked";
    const result = await fetchRevokedWorkspace(user);

    if (result.isErr()) {
      return apiError(req, res, {
        status_code: 404,
        api_error: {
          type: "workspace_not_found",
          message: "Workspace not found.",
        },
      });
    }
    workspace = result.value;
  } else {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message:
          "Invalid flow parameter. Expected 'no-auto-join' or 'revoked'.",
      },
    });
  }

  return res.status(200).json({
    workspace: renderLightWorkspaceType({ workspace }),
    status,
    workspaceVerifiedDomain,
  });
}

export default withSessionAuthentication(handler);
