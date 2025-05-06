import { Authenticator } from "@app/lib/auth";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import type { LightWorkspaceType } from "@app/types";

export class MCPServerViewFactory {
  static async create(
    workspace: LightWorkspaceType,
    mcpServerId: string,
    space: SpaceResource
  ): Promise<MCPServerViewResource> {
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const serverView = await MCPServerViewResource.create(auth, {
      mcpServerId,
      space,
    });

    return serverView;
  }
}
