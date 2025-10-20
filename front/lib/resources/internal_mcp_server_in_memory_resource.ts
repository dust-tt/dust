import { Op } from "sequelize";

import {
  autoInternalMCPServerNameToSId,
  internalMCPServerNameToSId,
} from "@app/lib/actions/mcp_helper";
import { isEnabledForWorkspace } from "@app/lib/actions/mcp_internal_actions";
import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import {
  allowsMultipleInstancesOfInternalMCPServerById,
  allowsMultipleInstancesOfInternalMCPServerByName,
  AVAILABLE_INTERNAL_MCP_SERVER_NAMES,
  getAvailabilityOfInternalMCPServerById,
  getAvailabilityOfInternalMCPServerByName,
  getInternalMCPServerNameAndWorkspaceId,
  isAutoInternalMCPServerName,
  isInternalMCPServerName,
  isInternalMCPServerOfName,
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
import { RemoteMCPServerToolMetadataModel } from "@app/lib/models/assistant/actions/remote_mcp_server_tool_metadata";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { cacheWithRedis } from "@app/lib/utils/cache";
import type { MCPOAuthUseCase, Result } from "@app/types";
import { Err, Ok, removeNulls } from "@app/types";
import { isDevelopment } from "@app/types";

const METADATA_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Getting the metadata is a relatively long operation, so we cache it for 5 minutes
// as internal servers are not expected to change often.
// In any case, when actually running the action, the metadata will be fetched from the MCP server.
const getCachedMetadata = cacheWithRedis(
  async (auth: Authenticator, id: string) => {
    const s = await connectToMCPServer(auth, {
      params: {
        type: "mcpServerId",
        mcpServerId: id,
        oAuthUseCase: null,
      },
    });

    if (s.isErr()) {
      return null;
    }

    const mcpClient = s.value;
    const md = extractMetadataFromServerVersion(mcpClient.getServerVersion());

    const metadata = {
      ...md,
      tools: extractMetadataFromTools(
        (await mcpClient.listTools()).tools
      ) as any,
      availability: isInternalMCPServerName(md.name)
        ? getAvailabilityOfInternalMCPServerByName(md.name)
        : "manual",
    };

    await mcpClient.close();

    return metadata;
  },
  (_auth: Authenticator, id: string) => `internal-mcp-server-metadata-${id}`,
  {
    ttlMs: isDevelopment() ? 1000 : METADATA_CACHE_TTL_MS,
  }
);

export class InternalMCPServerInMemoryResource {
  // SID of the internal MCP server, scoped to a workspace.
  readonly id: string;

  private metadata: Omit<
    MCPServerType,
    "sId" | "allowMultipleInstances" | "availability"
  > = {
    ...extractMetadataFromServerVersion(undefined),
    tools: [],
  };

  constructor(id: string) {
    this.id = id;
  }

  private static async init(auth: Authenticator, id: string) {
    const r = getInternalMCPServerNameAndWorkspaceId(id);
    if (r.isErr()) {
      return null;
    }

    const isEnabled = await isEnabledForWorkspace(auth, r.value.name);
    if (!isEnabled) {
      return null;
    }

    const server = new InternalMCPServerInMemoryResource(id);

    const cachedMetadata = await getCachedMetadata(auth, id);
    if (!cachedMetadata) {
      return null;
    }

    server.metadata = cachedMetadata;

    return server;
  }

  static async makeNew(
    auth: Authenticator,
    {
      name,
      useCase,
    }: {
      name: InternalMCPServerNameType;
      useCase: MCPOAuthUseCase | null;
    }
  ) {
    const systemSpace = await SpaceResource.fetchWorkspaceSystemSpace(auth);

    if (!systemSpace.canAdministrate(auth)) {
      throw new DustError(
        "unauthorized",
        "The user is not authorized to create an internal MCP server"
      );
    }

    let sid: string | null = null;

    if (isAutoInternalMCPServerName(name)) {
      sid = autoInternalMCPServerNameToSId({
        name,
        workspaceId: auth.getNonNullableWorkspace().id,
      });
    } else {
      const alreadyUsedIds = await MCPServerViewModel.findAll({
        where: {
          serverType: "internal",
          workspaceId: auth.getNonNullableWorkspace().id,
          vaultId: systemSpace.id,
        },
      });

      if (!allowsMultipleInstancesOfInternalMCPServerByName(name)) {
        const alreadyExistsForSameName = alreadyUsedIds.some((r) => {
          return isInternalMCPServerOfName(r.internalMCPServerId, name);
        });

        if (alreadyExistsForSameName) {
          throw new DustError(
            "internal_error",
            "The internal MCP server already exists for this name."
          );
        }
      }

      // 100 tries to avoid an infinite loop.
      for (let i = 1; i < 100; i++) {
        const prefix = Math.floor(Math.random() * 1000000);
        const tempSid = internalMCPServerNameToSId({
          name,
          workspaceId: auth.getNonNullableWorkspace().id,
          prefix,
        });
        if (!alreadyUsedIds.some((r) => r.internalMCPServerId === tempSid)) {
          sid = tempSid;
          break;
        }
      }
    }

    if (!sid) {
      throw new DustError(
        "internal_error",
        "Could not find an available id for the internal MCP server."
      );
    }

    const server = await InternalMCPServerInMemoryResource.init(auth, sid);

    if (!server) {
      throw new DustError(
        "internal_server_not_found",
        "Failed to create internal MCP server, the id is probably invalid." +
          sid
      );
    }

    await MCPServerViewModel.create({
      workspaceId: auth.getNonNullableWorkspace().id,
      serverType: "internal",
      internalMCPServerId: server.id,
      vaultId: systemSpace.id,
      editedAt: new Date(),
      editedByUserId: auth.user()?.id,
      oAuthUseCase: useCase ?? null,
    });

    return server;
  }

  async delete(
    auth: Authenticator
  ): Promise<Result<number, DustError<"unauthorized">>> {
    const canAdministrate =
      await SpaceResource.canAdministrateSystemSpace(auth);

    if (!canAdministrate) {
      throw new Err(
        new DustError(
          "unauthorized",
          "The user is not authorized to delete an internal MCP server"
        )
      );
    }

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

    await RemoteMCPServerToolMetadataModel.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        internalMCPServerId: this.id,
      },
    });

    return new Ok(1);
  }

  static async fetchById(
    auth: Authenticator,
    id: string,
    systemSpace: SpaceResource
  ) {
    // Fast path : Do not check for default internal MCP servers as they are always available.
    const availability = getAvailabilityOfInternalMCPServerById(id);
    if (availability === "manual") {
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
        prefix: 1, // We could use any value here.
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

  // Serialization.
  toJSON(): MCPServerType {
    return {
      sId: this.id,
      ...this.metadata,
      availability: getAvailabilityOfInternalMCPServerById(this.id),
      allowMultipleInstances: allowsMultipleInstancesOfInternalMCPServerById(
        this.id
      ),
    };
  }
}
