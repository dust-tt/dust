import { assert } from "console";
import type { Transaction } from "sequelize";
import { Op } from "sequelize";

import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions";
import { INTERNAL_MCP_SERVERS } from "@app/lib/actions/mcp_internal_actions";
import { AVAILABLE_INTERNAL_MCPSERVER_NAMES } from "@app/lib/actions/mcp_internal_actions/constants";
import type { MCPServerType } from "@app/lib/actions/mcp_metadata";
import {
  connectToMCPServer,
  extractMetadataFromServerVersion,
  extractMetadataFromTools,
} from "@app/lib/actions/mcp_metadata";
import type { Authenticator } from "@app/lib/auth";
import { MCPServerView } from "@app/lib/models/assistant/actions/mcp_server_view";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { makeSId } from "@app/lib/resources/string_ids";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { ModelId } from "@app/types";
import { removeNulls } from "@app/types";

export class InternalMCPServerInMemoryResource {
  // SID of the internal MCP server, scoped to a workspace.
  readonly id: string;

  private metadata: Omit<MCPServerType, "id"> = {
    ...extractMetadataFromServerVersion(undefined),
    tools: [],
  };

  constructor(id: string) {
    this.id = id;
  }

  private static async init(auth: Authenticator, id: string) {
    const server = new InternalMCPServerInMemoryResource(id);

    const mcpClient = await connectToMCPServer(auth, {
      type: "mcpServerId",
      mcpServerId: id,
    });

    server.metadata = {
      ...extractMetadataFromServerVersion(mcpClient.getServerVersion()),
      tools: extractMetadataFromTools(
        (await mcpClient.listTools()).tools
      ) as any,
    };

    await mcpClient.close();

    return server;
  }

  static async makeNew(
    auth: Authenticator,
    name: InternalMCPServerNameType,
    transaction?: Transaction
  ) {
    const systemSpace = await SpaceResource.fetchWorkspaceSystemSpace(auth);

    assert(
      systemSpace.canWrite(auth),
      "The user is not authorized to create an MCP server"
    );

    const server = await InternalMCPServerInMemoryResource.init(
      auth,
      InternalMCPServerInMemoryResource.nameToSId({
        name,
        workspaceId: auth.getNonNullableWorkspace().id,
      })
    );

    await MCPServerView.create(
      {
        workspaceId: auth.getNonNullableWorkspace().id,
        serverType: "internal",
        internalMCPServerId: server.id,
        vaultId: systemSpace.id,
        editedAt: new Date(),
        editedByUserId: auth.user()?.id,
      },
      { transaction }
    );

    return server;
  }

  static nameToSId({
    name,
    workspaceId,
  }: {
    name: InternalMCPServerNameType;
    workspaceId: ModelId;
  }): string {
    return makeSId("internal_mcp_server", {
      id: INTERNAL_MCP_SERVERS[name].id,
      workspaceId,
    });
  }

  async delete(auth: Authenticator) {
    await MCPServerView.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        internalMCPServerId: this.id,
      },
      hardDelete: true,
    });
  }

  static async fetchById(auth: Authenticator, id: string) {
    const systemSpace = await SpaceResource.fetchWorkspaceSystemSpace(auth);

    const server = await MCPServerView.findOne({
      attributes: ["internalMCPServerId"],
      where: {
        serverType: "internal",
        internalMCPServerId: id,
        workspaceId: auth.getNonNullableWorkspace().id,
        vaultId: systemSpace.id,
      },
    });

    if (!server || !server.internalMCPServerId) {
      return null;
    }

    return InternalMCPServerInMemoryResource.init(
      auth,
      server.internalMCPServerId
    );
  }

  static async listAvailableInternalMCPServers(auth: Authenticator) {
    const ids = AVAILABLE_INTERNAL_MCPSERVER_NAMES.map((name) =>
      InternalMCPServerInMemoryResource.nameToSId({
        name,
        workspaceId: auth.getNonNullableWorkspace().id,
      })
    );
    return concurrentExecutor(
      ids,
      (id) => InternalMCPServerInMemoryResource.init(auth, id),
      {
        concurrency: 10,
      }
    );
  }

  static async listByWorkspace(auth: Authenticator) {
    // In case of internal MCP servers, we list the ones that have a view in the system space.
    const systemSpace = await SpaceResource.fetchWorkspaceSystemSpace(auth);

    const servers = await MCPServerView.findAll({
      attributes: ["internalMCPServerId"],
      where: {
        serverType: "internal",
        internalMCPServerId: {
          [Op.not]: null,
        },
        workspaceId: auth.getNonNullableWorkspace().id,
        vaultId: systemSpace.id,
      },
    });

    return concurrentExecutor(
      removeNulls(servers.map((server) => server.internalMCPServerId)),
      async (internalMCPServerId) =>
        InternalMCPServerInMemoryResource.init(auth, internalMCPServerId),
      {
        concurrency: 10,
      }
    );
  }

  // Serialization.
  toJSON(): MCPServerType {
    return {
      id: this.id,
      ...this.metadata,
    };
  }
}
