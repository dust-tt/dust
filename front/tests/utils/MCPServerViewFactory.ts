import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import { Authenticator } from "@app/lib/auth";
import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
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

    const { view } = await MCPServerViewResource.create(auth, {
      systemView,
      space,
    });

    return view;
  }

  static async internal(
    workspace: LightWorkspaceType,
    name: InternalMCPServerNameType,
    space: SpaceResource
  ): Promise<MCPServerViewResource> {
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const server = await InternalMCPServerInMemoryResource.makeNew(auth, {
      name,
      useCase: null,
    });

    return this.create(workspace, server.id, space);
  }
}
