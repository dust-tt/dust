import { faker } from "@faker-js/faker";
import { RequestMethod } from "node-mocks-http";

import { RemoteMCPServerResource } from "@app/lib/resources/remote_mcp_servers_resource";
import { WorkspaceType } from "@app/types";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { Authenticator } from "@app/lib/auth";

type Tool = {
  name: string;
  description: string;
};

export class RemoteMCPServerFactory {
  static async create(
    workspace: WorkspaceType,
    space: SpaceResource,
    options: {
      name?: string;
      url?: string;
      description?: string;
      tools?: Tool[];
      sharedSecret?: string;
    } = {}
  ) {
    const name = options.name || "Test Server";
    const url = options.url || `https://${faker.internet.domainName()}`;
    const description = options.description || `${name} description`;
    const tools = options.tools || [
      { name: "tool", description: "Tool description" },
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
