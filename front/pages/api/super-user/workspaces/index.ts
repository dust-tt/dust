import { NextApiRequest, NextApiResponse } from "next";

import {
  getSession,
  getUserFromSession,
  planForWorkspace,
} from "@app/lib/auth";
import { ReturnedAPIErrorType } from "@app/lib/error";
import { Workspace } from "@app/lib/models";
import { apiError, withLogging } from "@app/logger/withlogging";
import { WorkspaceType } from "@app/types/user";

export type GetWorkspacesResponseBody = {
  workspaces: WorkspaceType[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetWorkspacesResponseBody | ReturnedAPIErrorType>
): Promise<void> {
  const session = await getSession(req, res);
  const user = await getUserFromSession(session);

  if (!user) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "user_not_found",
        message: "Could not find the user.",
      },
    });
  }

  if (!user.isDustSuperUser) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "user_not_found",
        message: "Could not find the user.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const workspaces = await Workspace.findAll();
      return res.status(200).json({
        workspaces: workspaces.map((ws) => ({
          id: ws.id,
          uId: ws.uId,
          sId: ws.sId,
          name: ws.name,
          allowedDomain: ws.allowedDomain || null,
          plan: planForWorkspace(ws),
          disableLabs: ws.disableLabs,
          role: "super_user",
        })),
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

export default withLogging(handler);
