import type { WhereOptions } from "sequelize";
import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";
import { Op } from "sequelize";

import {
  getServerTypeAndIdFromSId,
  remoteMCPServerNameToSId,
} from "@app/lib/actions/mcp_helper";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { MCPServerConnection } from "@app/lib/models/assistant/actions/mcp_server_connection";
import { BaseResource } from "@app/lib/resources/base_resource";
import { UserModel } from "@app/lib/resources/storage/models/user";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { getResourceIdFromSId, makeSId } from "@app/lib/resources/string_ids";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import type { ModelId, Result } from "@app/types";
import {
  Err,
  formatUserFullName,
  normalizeError,
  Ok,
  removeNulls,
} from "@app/types";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// eslint-disable-next-line @typescript-eslint/no-empty-interface, @typescript-eslint/no-unsafe-declaration-merging
export interface MCPServerConnectionResource
  extends ReadonlyAttributesType<MCPServerConnection> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class MCPServerConnectionResource extends BaseResource<MCPServerConnection> {
  static model: ModelStatic<MCPServerConnection> = MCPServerConnection;

  readonly user: Attributes<UserModel>;

  constructor(
    model: ModelStatic<MCPServerConnection>,
    blob: Attributes<MCPServerConnection>,
    { user }: { user: Attributes<UserModel> }
  ) {
    super(MCPServerConnection, blob);

    this.user = user;
  }

  static async makeNew(
    auth: Authenticator,
    blob: Omit<
      CreationAttributes<MCPServerConnection>,
      "userId" | "workspaceId"
    >
  ) {
    if (blob.connectionType === "workspace" && !auth.isAdmin()) {
      throw new DustError(
        "internal_error",
        "Only the admin can create a workspace connection"
      );
    }

    const user = auth.getNonNullableUser();
    const server = await MCPServerConnection.create({
      ...blob,
      workspaceId: auth.getNonNullableWorkspace().id,
      userId: user.id,
    });
    return new this(MCPServerConnection, server.get(), {
      user,
    });
  }

  // Fetching.

  private static async baseFetch(
    auth: Authenticator,
    { where, limit, order }: ResourceFindOptions<MCPServerConnection> = {}
  ) {
    const connections = await this.model.findAll({
      where: {
        ...where,
        workspaceId: auth.getNonNullableWorkspace().id,
      } as WhereOptions<MCPServerConnection>,
      limit,
      order,
      include: [
        {
          model: UserModel,
          as: "user",
        },
      ],
    });
    return connections.map(
      (b) =>
        new this(this.model, b.get(), {
          user: b.user?.get(),
        })
    );
  }

  static async fetchById(
    auth: Authenticator,
    id: string
  ): Promise<Result<MCPServerConnectionResource, DustError>> {
    const connRes = await this.fetchByIds(auth, [id]);

    if (connRes.isErr()) {
      return connRes;
    }

    return new Ok(connRes.value[0]);
  }

  static async fetchByIds(
    auth: Authenticator,
    ids: string[]
  ): Promise<Result<MCPServerConnectionResource[], DustError>> {
    const connModelIds = removeNulls(ids.map((id) => getResourceIdFromSId(id)));
    if (connModelIds.length !== ids.length) {
      return new Err(new DustError("invalid_id", "Invalid id"));
    }

    const connections = await this.baseFetch(auth, {
      where: {
        id: {
          [Op.in]: connModelIds,
        },
      },
    });

    if (connections.length !== ids.length) {
      return new Err(
        new DustError(
          "connection_not_found",
          ids.length === 1
            ? "Connection not found"
            : "Some connections were not found"
        )
      );
    }

    return new Ok(connections);
  }

  static async findByMCPServer(
    auth: Authenticator,
    {
      mcpServerId,
      connectionType,
    }: {
      mcpServerId: string;
      connectionType: MCPServerConnectionConnectionType;
    }
  ): Promise<Result<MCPServerConnectionResource, DustError>> {
    const { serverType, id } = getServerTypeAndIdFromSId(mcpServerId);

    const user = auth.user();
    if (connectionType === "personal" && !user) {
      throw new Error("Personal tools require the user to be authenticated.");
    }

    const connections = await this.baseFetch(auth, {
      where: {
        serverType,
        ...(serverType === "remote"
          ? { remoteMCPServerId: id }
          : { internalMCPServerId: mcpServerId }),
        connectionType,
        ...(connectionType === "personal"
          ? { userId: auth.getNonNullableUser().id }
          : {}),
      },
      // Only returns the latest connection for a given MCP server.
      order: [["createdAt", "DESC"]],
      limit: 1,
    });

    return connections.length > 0
      ? new Ok(connections[0])
      : new Err(new DustError("connection_not_found", "Connection not found"));
  }

  static async listByWorkspace(
    auth: Authenticator,
    { connectionType }: { connectionType: MCPServerConnectionConnectionType }
  ): Promise<MCPServerConnectionResource[]> {
    const connections: MCPServerConnectionResource[] = [];

    if (connectionType === "personal") {
      connections.push(
        ...(await this.baseFetch(auth, {
          where: {
            connectionType: "personal",
            userId: auth.getNonNullableUser().id,
          },
          order: [["createdAt", "DESC"]],
        }))
      );
    } else {
      connections.push(
        ...(await this.baseFetch(auth, {
          where: {
            connectionType: "workspace",
          },
          order: [["createdAt", "DESC"]],
        }))
      );
    }

    // Only return the latest connection for a given MCP server.
    // Ideally we would filter in the query directly.
    const latestConnectionsMap = new Map<string, MCPServerConnectionResource>();
    for (const connection of connections) {
      const serverKey =
        connection.internalMCPServerId ?? `${connection.remoteMCPServerId}`;
      if (!latestConnectionsMap.has(serverKey)) {
        latestConnectionsMap.set(serverKey, connection);
      }
    }
    return Array.from(latestConnectionsMap.values());
  }

  // Deletion.

  static async deleteAllForWorkspace(auth: Authenticator) {
    return this.model.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
      },
    });
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<undefined, Error>> {
    if (this.connectionType === "workspace" && !auth.isAdmin()) {
      return new Err(
        new DustError(
          "internal_error",
          "Only admins can delete a workspace connection"
        )
      );
    } else if (
      this.connectionType === "personal" &&
      this.userId !== auth.getNonNullableUser().id
    ) {
      return new Err(
        new DustError(
          "internal_error",
          "Only the user or admins can delete a personal connection"
        )
      );
    }

    try {
      await this.model.destroy({
        where: {
          id: this.id,
        },
        transaction,
      });

      // If connectionType is personal, delete all connections for the same server of the same user.
      if (this.connectionType === "personal") {
        await this.model.destroy({
          where: {
            userId: this.userId,
            connectionType: this.connectionType,
            internalMCPServerId: this.internalMCPServerId,
            remoteMCPServerId: this.remoteMCPServerId,
            workspaceId: this.workspaceId,
          },
          transaction,
        });
        //if connectionType is workspace, delete all workspace and personal connections, regardless of the user.
      } else if (this.connectionType === "workspace") {
        await this.model.destroy({
          where: {
            remoteMCPServerId: this.remoteMCPServerId,
            internalMCPServerId: this.internalMCPServerId,
            workspaceId: this.workspaceId,
          },
          transaction,
        });
      }
      return new Ok(undefined);
    } catch (err) {
      return new Err(normalizeError(err));
    }
  }

  get sId(): string {
    return MCPServerConnectionResource.modelIdToSId({
      id: this.id,
      workspaceId: this.workspaceId,
    });
  }

  static modelIdToSId({
    id,
    workspaceId,
  }: {
    id: ModelId;
    workspaceId: ModelId;
  }): string {
    return makeSId("mcp_server_connection", {
      id,
      workspaceId,
    });
  }

  // Serialization.
  toJSON(): MCPServerConnectionType {
    return {
      sId: this.sId,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      connectionType: this.connectionType,
      serverType: this.serverType,
      internalMCPServerId: this.internalMCPServerId,
      user: {
        fullName: formatUserFullName(this.user),
        imageUrl: this.user.imageUrl,
        email: this.user.email,
        userId: this.user.sId,
      },
      remoteMCPServerId:
        this.remoteMCPServerId &&
        remoteMCPServerNameToSId({
          remoteMCPServerId: this.remoteMCPServerId,
          workspaceId: this.workspaceId,
        }),
    };
  }
}

export type MCPServerConnectionConnectionType = "workspace" | "personal";

export const isMCPServerConnectionConnectionType = (
  connectionType: unknown
): connectionType is MCPServerConnectionConnectionType => {
  return connectionType === "workspace" || connectionType === "personal";
};

export interface MCPServerConnectionType {
  sId: string;
  createdAt: Date;
  updatedAt: Date;
  user: {
    fullName: string | null;
    imageUrl: string | null;
    email: string | null;
    userId: string | null;
  };
  connectionType: MCPServerConnectionConnectionType;
  serverType: string;
  remoteMCPServerId: string | null;
  internalMCPServerId: string | null;
}
