/** @ignoreswagger */
import { getServerTypeAndIdFromSId } from "@app/lib/actions/mcp_helper";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { RemoteMCPServerResource } from "@app/lib/resources/remote_mcp_servers_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { apiError, withLogging } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";

export interface GetUserApprovalsResponseBody {
  approvals: {
    mcpServerId: string;
    toolNames: string[];
    serverName: string;
  }[];
}

export interface DeleteUserApprovalsResponseBody {
  success: boolean;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      GetUserApprovalsResponseBody | DeleteUserApprovalsResponseBody
    >
  >,
  auth: Authenticator
): Promise<void> {
  const user = auth.getNonNullableUser();
  const userResource = new UserResource(UserResource.model, user);

  if (req.method === "DELETE") {
    const mcpServerId = req.query.mcpServerId;
    if (typeof mcpServerId !== "string") {
      return apiError(req, res, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "mcpServerId query parameter is required.",
        },
      });
    }
    await userResource.deleteToolApprovals(auth, { mcpServerId });
    return res.status(200).json({ success: true });
  }

  if (req.method !== "GET") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message:
          "The method passed is not supported, GET or DELETE is expected.",
      },
    });
  }

  const toolValidations = await userResource.getUserToolApprovals(auth);

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
          const systemSpace =
            await SpaceResource.fetchWorkspaceSystemSpace(auth);
          const server = await InternalMCPServerInMemoryResource.fetchById(
            auth,
            validation.mcpServerId,
            systemSpace
          );
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          serverName = server?.toJSON().name || "Unknown Internal Server";
        } else if (serverType === "remote") {
          const server = await RemoteMCPServerResource.fetchById(
            auth,
            validation.mcpServerId
          );
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          serverName = server?.toJSON().name || "Unknown Remote Server";
        }
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        // biome-ignore lint/correctness/noUnusedVariables: ignored using `--suppress`
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
