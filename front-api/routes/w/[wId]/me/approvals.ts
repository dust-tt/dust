import { getServerTypeAndIdFromSId } from "@app/lib/actions/mcp_helper";
import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { RemoteMCPServerResource } from "@app/lib/resources/remote_mcp_servers_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

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

const DeleteQuerySchema = z.object({
  mcpServerId: z.string(),
});

// Mounted at /api/w/:wId/me/approvals.
const app = workspaceApp();

app.get("/", async (ctx): HandlerResult<GetUserApprovalsResponseBody> => {
  const auth = ctx.get("auth");
  const user = auth.getNonNullableUser();
  const userResource = new UserResource(UserResource.model, user);

  const toolValidations = await userResource.getUserToolApprovals(auth);

  const approvals: GetUserApprovalsResponseBody["approvals"] = [];

  for (const validation of toolValidations) {
    if (validation.toolNames.length === 0) {
      continue;
    }

    let serverName = "Unknown Server";

    try {
      const { serverType } = getServerTypeAndIdFromSId(validation.mcpServerId);

      if (serverType === "internal") {
        const systemSpace = await SpaceResource.fetchWorkspaceSystemSpace(auth);
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
    } catch {
      // If we can't parse the server ID or fetch the server, use default name.
    }

    approvals.push({
      mcpServerId: validation.mcpServerId,
      toolNames: validation.toolNames,
      serverName,
    });
  }

  return ctx.json({ approvals });
});

app.delete(
  "/",
  validate("query", DeleteQuerySchema),
  async (ctx): HandlerResult<DeleteUserApprovalsResponseBody> => {
    const auth = ctx.get("auth");
    const user = auth.getNonNullableUser();
    const userResource = new UserResource(UserResource.model, user);

    const { mcpServerId } = ctx.req.valid("query");

    await userResource.deleteToolApprovals(auth, { mcpServerId });

    return ctx.json({ success: true });
  }
);

export default app;
