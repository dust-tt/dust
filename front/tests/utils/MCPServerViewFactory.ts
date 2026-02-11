import { Authenticator } from "@app/lib/auth";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import type { LightWorkspaceType } from "@app/types/user";

export class MCPServerViewFactory {
  static async create(
    workspace: LightWorkspaceType,
    mcpServerId: string,
    space: SpaceResource
  ): Promise<MCPServerViewResource> {
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const systemView =
      await MCPServerViewResource.getMCPServerViewForSystemSpace(
        auth,
        mcpServerId
      );

    if (!systemView) {
      throw new Error(
        "System view not found, make sure you created it in your test."
      );
    }

    const serverView = await MCPServerViewResource.create(auth, {
      systemView,
      space,
    });

    return serverView;
  }
}
