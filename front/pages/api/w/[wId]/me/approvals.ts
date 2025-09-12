import type { NextApiRequest, NextApiResponse } from "next";

import { getServerTypeAndIdFromSId } from "@app/lib/actions/mcp_helper";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { RemoteMCPServerResource } from "@app/lib/resources/remote_mcp_servers_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { apiError, withLogging } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

export interface GetUserApprovalsResponseBody {
  approvals: {
    mcpServerId: string;
    toolNames: string[];
    serverName: string;
  }[];
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetUserApprovalsResponseBody>>,
  auth: Authenticator
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
  const userResource = new UserResource(UserResource.model, user);
  const toolValidations = await userResource.getToolValidations();

  const approvals: {
    mcpServerId: string;
    toolNames: string[];
    serverName: string;
  }[] = [];

  for (const validation of toolValidations) {
    if (validation.toolNames.length > 0) {
      let serverName = "Unknown Server";

      try {
        const { serverType } = getServerTypeAndIdFromSId(
          validation.mcpServerId
        );

        if (serverType === "internal") {
          const server = await InternalMCPServerInMemoryResource.fetchById(
            auth,
            validation.mcpServerId
          );
          serverName = server?.toJSON().name || "Unknown Internal Server";
        } else if (serverType === "remote") {
          const server = await RemoteMCPServerResource.fetchById(
            auth,
            validation.mcpServerId
          );
          serverName = server?.toJSON().name || "Unknown Remote Server";
        }
      } catch (error) {
        // If we can't parse the server ID or fetch the server, use default name
      }

      approvals.push({
        mcpServerId: validation.mcpServerId,
        toolNames: validation.toolNames,
        serverName,
      });
    }
  }

  return res.status(200).json({
    approvals,
  });
}

export default withLogging(withSessionAuthenticationForWorkspace(handler));
