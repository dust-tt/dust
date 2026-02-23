import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";

export type PokeListMCPServerViews = {
  serverViews: MCPServerViewType[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PokeListMCPServerViews>>,
  session: SessionWithUser
): Promise<void> {
  const { wId } = req.query;
  if (typeof wId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace you're trying to access was not found.",
      },
    });
  }

  const auth = await Authenticator.fromSuperUserSession(session, wId);

  const owner = auth.workspace();

  if (!owner || !auth.isDustSuperUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "mcp_server_view_not_found",
        message: "Could not find the MCP server views.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const { globalSpaceOnly } = req.query;

      let mcpServerViews: MCPServerViewResource[];
      if (globalSpaceOnly === "true") {
        const globalSpace = await SpaceResource.fetchWorkspaceGlobalSpace(auth);
        mcpServerViews = await MCPServerViewResource.listBySpace(
          auth,
          globalSpace
        );
      } else {
        mcpServerViews = await MCPServerViewResource.listByWorkspace(auth);
      }

      return res.status(200).json({
        serverViews: mcpServerViews.map((sv) => sv.toJSON()),
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

export default withSessionAuthenticationForPoke(handler);
