import assert from "assert";
import { randomBytes } from "crypto";
import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";

import {
  DEFAULT_MCP_ACTION_DESCRIPTION,
  DEFAULT_MCP_ACTION_NAME,
} from "@app/lib/actions/constants";
import { remoteMCPServerNameToSId } from "@app/lib/actions/mcp_helper";
import type { AllowedIconType } from "@app/lib/actions/mcp_icons";
import type { MCPServerType, MCPToolType } from "@app/lib/actions/mcp_metadata";
import type { Authenticator } from "@app/lib/auth";
import { MCPServerView } from "@app/lib/models/assistant/actions/mcp_server_view";
import { destroyMCPServerViewDependencies } from "@app/lib/models/assistant/actions/mcp_server_view_helper";
import { RemoteMCPServer } from "@app/lib/models/assistant/actions/remote_mcp_server";
import { RemoteMCPServerToolMetadata } from "@app/lib/models/assistant/actions/remote_mcp_server_tool_metadata";
import { BaseResource } from "@app/lib/resources/base_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { getResourceIdFromSId } from "@app/lib/resources/string_ids";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { Result } from "@app/types";
import { Ok, removeNulls } from "@app/types";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// eslint-disable-next-line @typescript-eslint/no-empty-interface, @typescript-eslint/no-unsafe-declaration-merging
export interface RemoteMCPServerResource
  extends ReadonlyAttributesType<RemoteMCPServer> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class RemoteMCPServerResource extends BaseResource<RemoteMCPServer> {
  static model: ModelStatic<RemoteMCPServer> = RemoteMCPServer;

  constructor(
    model: ModelStatic<RemoteMCPServer>,
    blob: Attributes<RemoteMCPServer>
  ) {
    super(RemoteMCPServer, blob);
  }

  static async makeNew(
    auth: Authenticator,
    blob: Omit<
      CreationAttributes<RemoteMCPServer>,
      "name" | "description" | "spaceId" | "sId" | "sharedSecret" | "lastSyncAt"
    >,
    transaction?: Transaction
  ) {
    const systemSpace = await SpaceResource.fetchWorkspaceSystemSpace(auth);

    assert(
      systemSpace.canWrite(auth),
      "The user is not authorized to create an MCP server"
    );

    const sharedSecret = randomBytes(32).toString("hex");

    const server = await RemoteMCPServer.create(
      {
        ...blob,
        name: blob.cachedName || DEFAULT_MCP_ACTION_NAME,
        description: blob.cachedDescription || DEFAULT_MCP_ACTION_DESCRIPTION,
        sharedSecret,
        lastSyncAt: new Date(),
      },
      { transaction }
    );

    // Immediately create a view for the server in the system space.
    await MCPServerView.create(
      {
        workspaceId: auth.getNonNullableWorkspace().id,
        serverType: "remote",
        remoteMCPServerId: server.id,
        vaultId: systemSpace.id,
        editedAt: new Date(),
        editedByUserId: auth.user()?.id,
      },
      {
        transaction,
      }
    );

    return new this(RemoteMCPServer, server.get());
  }

  // Fetching.

  private static async baseFetch(
    auth: Authenticator,
    options?: ResourceFindOptions<RemoteMCPServer>
  ) {
    const { where, ...otherOptions } = options ?? {};

    const servers = await RemoteMCPServer.findAll({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        ...where,
      },
      ...otherOptions,
    });

    return servers.map((server) => new this(RemoteMCPServer, server.get()));
  }

  static async fetchByIds(
    auth: Authenticator,
    ids: string[]
  ): Promise<RemoteMCPServerResource[]> {
    return this.baseFetch(auth, {
      where: {
        id: removeNulls(ids.map(getResourceIdFromSId)),
      },
    });
  }

  static async fetchById(
    auth: Authenticator,
    id: string
  ): Promise<RemoteMCPServerResource | null> {
    const [server] = await this.fetchByIds(auth, [id]);
    return server ?? null;
  }

  static async findByPk(
    auth: Authenticator,
    id: number,
    options?: ResourceFindOptions<RemoteMCPServer>
  ): Promise<RemoteMCPServerResource | null> {
    const servers = await this.baseFetch(auth, {
      where: {
        id,
      },
      ...options,
    });
    return servers.length > 0 ? servers[0] : null;
  }

  static async listByWorkspace(auth: Authenticator) {
    return this.baseFetch(auth);
  }

  static async findByUrl(auth: Authenticator, url: string) {
    const servers = await this.baseFetch(auth, {
      where: {
        url,
      },
    });

    return servers.length > 0 ? servers[0] : null;
  }

  // sId
  get sId(): string {
    return remoteMCPServerNameToSId({
      remoteMCPServerId: this.id,
      workspaceId: this.workspaceId,
    });
  }

  // Deletion.

  async delete(
    auth: Authenticator
  ): Promise<Result<undefined | number, Error>> {
    const mcpServerViews = await MCPServerView.findAll({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        remoteMCPServerId: this.id,
      },
    });

    const serverToolMetadatas = await RemoteMCPServerToolMetadata.findAll({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        remoteMCPServerId: this.id,
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

    await concurrentExecutor(
      serverToolMetadatas,
      async (serverToolMetadata) => {
        await serverToolMetadata.destroy();
      },
      { concurrency: 10 }
    );

    // Directly delete the MCPServerView here to avoid a circular dependency.
    await MCPServerView.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        remoteMCPServerId: this.id,
      },
      // Use 'hardDelete: true' to ensure the record is permanently deleted from the database,
      // bypassing the soft deletion in place.
      hardDelete: true,
    });

    const deletedCount = await RemoteMCPServer.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        id: this.id,
      },
    });

    return new Ok(deletedCount);
  }

  // Mutation.

  async updateMetadata(
    auth: Authenticator,
    {
      name,
      description,
      icon,
      sharedSecret,
      cachedName,
      cachedDescription,
      cachedTools,
      lastSyncAt,
    }: {
      name?: string;
      description?: string;
      icon?: AllowedIconType;
      sharedSecret?: string;
      cachedName?: string;
      cachedDescription?: string;
      cachedTools?: MCPToolType[];
      lastSyncAt: Date;
    }
  ) {
    // If we update the cachedName or cachedDescription, and the name is currently the default one,
    // we need to update the name and description as well.
    if (cachedName && this.name === this.cachedName) {
      name = cachedName;
    }
    if (cachedDescription && this.description === this.cachedDescription) {
      description = cachedDescription;
    }

    await this.update({
      name,
      description,
      icon,
      sharedSecret,
      cachedName,
      cachedDescription,
      cachedTools,
      lastSyncAt,
    });
  }

  // Serialization.
  toJSON(): MCPServerType & {
    // Remote MCP Server specifics
    cachedName: string;
    cachedDescription: string | null;
    url: string;
    lastSyncAt: number | null;
    sharedSecret: string;
  } {
    return {
      id: this.sId,

      name: this.name,
      description: this.description,
      version: this.version,
      icon: this.icon,
      tools: this.cachedTools,

      cachedName: this.cachedName,
      cachedDescription:
        this.cachedDescription ?? DEFAULT_MCP_ACTION_DESCRIPTION,
      authorization: this.authorization,
      isDefault: false, // So far we don't have defaults remote MCP servers.

      // Remote MCP Server specifics
      url: this.url,
      lastSyncAt: this.lastSyncAt?.getTime() ?? null,
      sharedSecret: this.sharedSecret,
    };
  }
}

RemoteMCPServerToolMetadata.belongsTo(RemoteMCPServer, {
  foreignKey: { allowNull: false, name: "serverId" },
  onDelete: "RESTRICT",
});

RemoteMCPServer.hasMany(RemoteMCPServerToolMetadata, {
  foreignKey: "serverId",
  onDelete: "RESTRICT",
});
