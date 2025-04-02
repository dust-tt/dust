import { faker } from "@faker-js/faker";

import type { MCPToolType } from "@app/lib/actions/mcp_metadata";
import { Authenticator } from "@app/lib/auth";
import { RemoteMCPServerResource } from "@app/lib/resources/remote_mcp_servers_resource";
import type { WorkspaceType } from "@app/types";

export class RemoteMCPServerFactory {
  static async create(
    workspace: WorkspaceType,
    options: {
      name?: string;
      url?: string;
      description?: string;
      tools?: MCPToolType[];
    } = {}
  ) {
    const name = options.name || "Test Server";
    const url = options.url || `https://${faker.internet.domainName()}`;
    const description = options.description || `${name} description`;
    const tools: MCPToolType[] = options.tools || [
      { name: "tool", description: "Tool description", inputSchema: undefined },
    ];
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    return RemoteMCPServerResource.makeNew(auth, {
      workspaceId: workspace.id,
      name,
      url,
      description,
      cachedTools: tools,
    });
  }
}
