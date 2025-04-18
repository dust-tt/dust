import assert from "assert";
import type { Transaction } from "sequelize";
import { Op } from "sequelize";

import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import { internalMCPServerNameToSId } from "@app/lib/actions/mcp_helper";
import { isEnabledForWorkspace } from "@app/lib/actions/mcp_internal_actions";
import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import {
  AVAILABLE_INTERNAL_MCP_SERVER_NAMES,
  getInternalMCPServerNameAndWorkspaceId,
  INTERNAL_TOOLS_STAKE_LEVEL,
  isDefaultInternalMCPServer,
  isDefaultInternalMCPServerByName,
  isInternalMCPServerName,
} from "@app/lib/actions/mcp_internal_actions/constants";
import {
  connectToMCPServer,
  extractMetadataFromServerVersion,
  extractMetadataFromTools,
} from "@app/lib/actions/mcp_metadata";
import type { MCPServerType } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { MCPServerConnection } from "@app/lib/models/assistant/actions/mcp_server_connection";
import { MCPServerViewModel } from "@app/lib/models/assistant/actions/mcp_server_view";
import { destroyMCPServerViewDependencies } from "@app/lib/models/assistant/actions/mcp_server_view_helper";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { cacheWithRedis } from "@app/lib/utils/cache";
import { removeNulls } from "@app/types";

const METADATA_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

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
    const r = getInternalMCPServerNameAndWorkspaceId(id);
    if (r.isErr()) {
      return null;
    }

    const server = new InternalMCPServerInMemoryResource(id);

    // Getting the metadata is a relatively long operation, so we cache it for 5 minutes
    // as internal servers are not expected to change often.
    // In any case, when actually running the action, the metadata will be fetched from the MCP server.
    const getCachedMetadata = cacheWithRedis(
      async (id: string) => {
        const s = await connectToMCPServer(auth, {
          type: "mcpServerId",
          mcpServerId: id,
        });

        if (s.isErr()) {
          return null;
        }

        const mcpClient = s.value;
        const md = extractMetadataFromServerVersion(
          mcpClient.getServerVersion()
        );

        const metadata = {
          ...md,
          tools: extractMetadataFromTools(
            (await mcpClient.listTools()).tools
          ) as any,
          isDefault: isInternalMCPServerName(md.name)
            ? isDefaultInternalMCPServerByName(md.name)
            : false,
        };

        await mcpClient.close();

        return metadata;
      },
      (id) => `internal-mcp-server-metadata-${id}`,
      METADATA_CACHE_TTL_MS
    );

    const cachedMetadata = await getCachedMetadata(id);
    if (!cachedMetadata) {
      return null;
    }

    server.metadata = cachedMetadata;

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

    if (!server) {
      throw new DustError(
        "internal_server_not_found",
        "Failed to create internal MCP server, the id is probably invalid."
      );
    }

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

    await MCPServerConnection.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        internalMCPServerId: this.id,
      },
    });
  }

  static async fetchById(auth: Authenticator, id: string) {
    // Fast path : Do not check for default internal MCP servers as they are always available.
    if (!isDefaultInternalMCPServer(id)) {
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
    }

    return InternalMCPServerInMemoryResource.init(auth, id);
  }

  static async listAvailableInternalMCPServers(auth: Authenticator) {
    // Hide servers with flags that are not enabled for the workspace.
    const names: InternalMCPServerNameType[] = [];

    for (const name of AVAILABLE_INTERNAL_MCP_SERVER_NAMES) {
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

    const resources = await concurrentExecutor(
      ids,
      (id) => InternalMCPServerInMemoryResource.init(auth, id),
      {
        concurrency: 10,
      }
    );

    return removeNulls(resources);
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

    const resources = await concurrentExecutor(
      removeNulls(servers.map((server) => server.internalMCPServerId)),
      async (internalMCPServerId) =>
        // This does not create them in the workspace, only in memory, we need to call "makeNew" to create them in the workspace.
        InternalMCPServerInMemoryResource.init(auth, internalMCPServerId),
      {
        concurrency: 10,
      }
    );

    return removeNulls(resources);
  }

  static getToolsConfigByServerId(
    serverId: string
  ): Record<string, MCPToolStakeLevelType> {
    const r = getInternalMCPServerNameAndWorkspaceId(serverId);
    if (r.isErr()) {
      throw new Error(`Internal MCP server not found for id ${serverId}`);
    }
    const server = r.value.name;
    return INTERNAL_TOOLS_STAKE_LEVEL[server] || {};
  }

  // Serialization.
  toJSON(): MCPServerType {
    return {
      id: this.id,
      ...this.metadata,
    };
  }
}
