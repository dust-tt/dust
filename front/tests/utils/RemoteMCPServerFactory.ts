import { faker } from "@faker-js/faker";

import type { MCPToolMetadata } from "@app/lib/actions/mcp_actions";
import { Authenticator } from "@app/lib/auth";
import { RemoteMCPServerResource } from "@app/lib/resources/remote_mcp_servers_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import type { WorkspaceType } from "@app/types";

export class RemoteMCPServerFactory {
  static async create(
    workspace: WorkspaceType,
    space: SpaceResource,
    options: {
      name?: string;
      url?: string;
      description?: string;
      tools?: MCPToolMetadata[];
      sharedSecret?: string;
    } = {}
  ) {
    const name = options.name || "Test Server";
    const url = options.url || `https://${faker.internet.domainName()}`;
    const description = options.description || `${name} description`;
    const tools: MCPToolMetadata[] = options.tools || [
      { name: "tool", description: "Tool description", inputSchema: undefined },
    ];
    const sharedSecret =
      options.sharedSecret || `secret-${faker.string.alphanumeric(8)}`;

    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    return RemoteMCPServerResource.makeNew(
      auth,
      {
        workspaceId: workspace.id,
        name,
        url,
        description,
        cachedTools: tools,
        lastSyncAt: new Date(),
        sharedSecret,
      },
      space
    );
  }
}
