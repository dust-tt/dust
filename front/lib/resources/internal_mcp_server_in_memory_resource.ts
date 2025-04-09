import assert from "assert";
import type { Transaction } from "sequelize";
import { Op } from "sequelize";

import { internalMCPServerNameToSId } from "@app/lib/actions/mcp_helper";
import { isEnabledForWorkspace } from "@app/lib/actions/mcp_internal_actions";
import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import {
  isDefaultInternalMCPServerByName,
  isInternalMCPServerName,
} from "@app/lib/actions/mcp_internal_actions/constants";
import { AVAILABLE_INTERNAL_MCPSERVER_NAMES } from "@app/lib/actions/mcp_internal_actions/constants";
import type { MCPServerType } from "@app/lib/actions/mcp_metadata";
import {
  connectToMCPServer,
  extractMetadataFromServerVersion,
  extractMetadataFromTools,
} from "@app/lib/actions/mcp_metadata";
import type { Authenticator } from "@app/lib/auth";
import { MCPServerViewModel } from "@app/lib/models/assistant/actions/mcp_server_view";
import { destroyMCPServerViewDependencies } from "@app/lib/models/assistant/actions/mcp_server_view_helper";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { removeNulls } from "@app/types";

export class InternalMCPServerInMemoryResource {
  // SID of the internal MCP server, scoped to a workspace.
  readonly id: string;

  private metadata: Omit<MCPServerType, "id"> = {
    ...extractMetadataFromServerVersion(undefined),
    tools: [],
    isDefault: false,
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

    const md = extractMetadataFromServerVersion(mcpClient.getServerVersion());

    server.metadata = {
      ...md,
      tools: extractMetadataFromTools(
        (await mcpClient.listTools()).tools
      ) as any,
      isDefault: isInternalMCPServerName(md.name)
        ? isDefaultInternalMCPServerByName(md.name)
        : false,
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
      internalMCPServerNameToSId({
        name,
        workspaceId: auth.getNonNullableWorkspace().id,
      })
    );

    await MCPServerViewModel.create(
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

  async delete(auth: Authenticator) {
    const mcpServerViews = await MCPServerViewModel.findAll({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        internalMCPServerId: this.id,
      },
    });

    await concurrentExecutor(
      mcpServerViews,
      async (mcpServerView) => {
        await destroyMCPServerViewDependencies(auth, {
          mcpServerViewId: mcpServerView.id,
        });
      },
      { concurrency: 10 }
    );

    await MCPServerViewModel.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        internalMCPServerId: this.id,
      },
      hardDelete: true,
    });
  }

  static async fetchById(auth: Authenticator, id: string) {
    const systemSpace = await SpaceResource.fetchWorkspaceSystemSpace(auth);

    const server = await MCPServerViewModel.findOne({
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
    // Hide servers with flags that are not enabled for the workspace.
    const names: InternalMCPServerNameType[] = [];

    for (const name of AVAILABLE_INTERNAL_MCPSERVER_NAMES) {
      const isEnabled = await isEnabledForWorkspace(auth, name);

      if (isEnabled) {
        names.push(name);
      }
    }

    const ids = names.map((name) =>
      internalMCPServerNameToSId({
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

    const servers = await MCPServerViewModel.findAll({
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
        // This does not create them in the workspace, only in memory, we need to call "makeNew" to create them in the workspace.
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
