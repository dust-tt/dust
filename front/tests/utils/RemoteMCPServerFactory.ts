import { faker } from "@faker-js/faker";
import { RequestMethod } from "node-mocks-http";

import { RemoteMCPServerResource } from "@app/lib/resources/remote_mcp_servers_resource";
import { WorkspaceType } from "@app/types";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";

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

    return RemoteMCPServerResource.makeNew(
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

  /**
   * Helper function to set up a test environment with workspace, space, and request/response objects
   */
  static async setupTest(
    db: any,
    role: "builder" | "user" | "admin" = "builder",
    method: RequestMethod = "GET"
  ) {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      role,
      method,
    });

    const space = await SpaceFactory.global(workspace, db);

    // Set up common query parameters
    req.query.wId = workspace.sId;
    req.query.spaceId = space.sId;

    return { req, res, workspace, space };
  }
}
