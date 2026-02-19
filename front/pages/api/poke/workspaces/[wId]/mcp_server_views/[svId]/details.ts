import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { mcpServerViewToPokeJSON } from "@app/lib/poke/utils";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { PokeMCPServerViewType } from "@app/types/poke";
import type { NextApiRequest, NextApiResponse } from "next";

export type PokeGetMCPServerViewDetails = {
  mcpServerView: PokeMCPServerViewType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PokeGetMCPServerViewDetails>>,
  session: SessionWithUser
): Promise<void> {
  const { wId, svId } = req.query;
  if (typeof wId !== "string" || typeof svId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid workspace or MCP server view ID.",
      },
    });
  }

  const auth = await Authenticator.fromSuperUserSession(session, wId);
  const owner = auth.workspace();

  if (!owner || !auth.isDustSuperUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "Workspace not found.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const mcpServerView = await MCPServerViewResource.fetchById(auth, svId);

      if (!mcpServerView) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "mcp_server_view_not_found",
            message: "MCP server view not found.",
          },
        });
      }
      const mcpServerViewJSON = await mcpServerViewToPokeJSON(
        mcpServerView,
        auth
      );
      return res.status(200).json({
        mcpServerView: mcpServerViewJSON,
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
