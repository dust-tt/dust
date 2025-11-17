import { faker } from "@faker-js/faker";

import { DEFAULT_MCP_ACTION_VERSION } from "@app/lib/actions/constants";
import { DEFAULT_MCP_SERVER_ICON } from "@app/lib/actions/mcp_icons";
import type { MCPToolType } from "@app/lib/api/mcp";
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
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    const cachedName = options.name || "Test Server" + faker.number.int(1000);
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    const url = options.url || `https://${faker.internet.domainName()}`;
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    const cachedDescription = options.description || `${name} description`;
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    const tools: MCPToolType[] = options.tools || [
      { name: "tool", description: "Tool description", inputSchema: undefined },
    ];
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    return RemoteMCPServerResource.makeNew(auth, {
      workspaceId: workspace.id,
      cachedName,
      url,
      cachedDescription,
      cachedTools: tools,
      icon: DEFAULT_MCP_SERVER_ICON,
      version: DEFAULT_MCP_ACTION_VERSION,
      authorization: null,
      oAuthUseCase: null,
    });
  }
}
