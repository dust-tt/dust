import {
  getServerTypeAndIdFromSId,
  remoteMCPServerNameToSId,
} from "@app/lib/actions/mcp_helper";
import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import {
  getInternalMCPServerNameFromSId,
  matchesInternalMCPServerName,
} from "@app/lib/actions/mcp_internal_actions/constants";
import {
  buildAuditLogTarget,
  emitAuditLogEvent,
} from "@app/lib/api/audit/workos_audit";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { MCPServerConnectionModel } from "@app/lib/models/agent/actions/mcp_server_connection";
import { BaseResource } from "@app/lib/resources/base_resource";
import { UserModel } from "@app/lib/resources/storage/models/user";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { getResourceIdFromSId, makeSId } from "@app/lib/resources/string_ids";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { removeNulls } from "@app/types/shared/utils/general";
import { formatUserFullName } from "@app/types/user";
import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
  WhereOptions,
} from "sequelize";
import { Op } from "sequelize";

type MCPServerConnectionResourceFindOptions =
  ResourceFindOptions<MCPServerConnectionModel> & {
    includeUser?: boolean;
  };

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface MCPServerConnectionResource
  extends ReadonlyAttributesType<MCPServerConnectionModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class MCPServerConnectionResource extends BaseResource<MCPServerConnectionModel> {
  static model: ModelStatic<MCPServerConnectionModel> =
    MCPServerConnectionModel;

  readonly user: Attributes<UserModel>;

  constructor(
    model: ModelStatic<MCPServerConnectionModel>,
    blob: Attributes<MCPServerConnectionModel>,
    { user }: { user: Attributes<UserModel> }
  ) {
    super(MCPServerConnectionModel, blob);

    this.user = user;
  }

  static async makeNew(
    auth: Authenticator,
    blob: Omit<
      CreationAttributes<MCPServerConnectionModel>,
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
    const server = await MCPServerConnectionModel.create({
      ...blob,
      workspaceId: auth.getNonNullableWorkspace().id,
      userId: user.id,
    });

    const resource = new this(MCPServerConnectionModel, server.get(), {
      user,
    });

    void emitAuditLogEvent({
      auth,
      action: "mcp_connection.created",
      targets: [
        buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
        buildAuditLogTarget("mcp_connection", {
          sId: resource.sId,
          name:
            getInternalMCPServerNameFromSId(resource.internalMCPServerId) ??
            resource.internalMCPServerId ??
            String(resource.remoteMCPServerId ?? "unknown"),
        }),
      ],
      metadata: {
        connection_type: blob.connectionType ?? "unknown",
        server_type: resource.internalMCPServerId ? "internal" : "remote",
        auth_type: blob.connectionId ? "oauth" : "keypair",
      },
    });

    return resource;
  }

  // Fetching.

  private static async baseFetch(
    auth: Authenticator,
    {
      attributes,
      where,
      limit,
      order,
      includeUser = true,
    }: MCPServerConnectionResourceFindOptions = {}
  ) {
    const connections = await this.model.findAll({
      attributes,
      where: {
        ...where,
        workspaceId: auth.getNonNullableWorkspace().id,
      } as WhereOptions<MCPServerConnectionModel>,
      limit,
      order,
      ...(includeUser
        ? {
            include: [
              {
                model: UserModel,
                as: "user",
              },
            ],
          }
        : {}),
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

  static async findByInternalServerName(
    auth: Authenticator,
    {
      serverName,
      connectionType,
    }: {
      serverName: InternalMCPServerNameType;
      connectionType: MCPServerConnectionConnectionType;
    }
  ): Promise<MCPServerConnectionResource | null> {
    const connections = await this.baseFetch(auth, {
      where: {
        serverType: "internal",
        connectionType,
        ...(connectionType === "personal"
          ? { userId: auth.getNonNullableUser().id }
          : {}),
      },
      order: [["createdAt", "DESC"]],
    });

    return (
      connections.find((c) =>
        matchesInternalMCPServerName(c.internalMCPServerId, serverName)
      ) ?? null
    );
  }

  static async listByMCPServer(
    auth: Authenticator,
    {
      mcpServerId,
    }: {
      mcpServerId: string;
    }
  ): Promise<Result<MCPServerConnectionResource[], DustError>> {
    const { serverType, id } = getServerTypeAndIdFromSId(mcpServerId);

    const connections = await this.baseFetch(auth, {
      where: {
        serverType,
        ...(serverType === "remote"
          ? { remoteMCPServerId: id }
          : { internalMCPServerId: mcpServerId }),
      },
      order: [["createdAt", "DESC"]],
    });

    return new Ok(connections);
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

  static async listWorkspaceConnectionsByMCPServerIds(
    auth: Authenticator,
    { mcpServerIds }: { mcpServerIds: string[] }
  ): Promise<MCPServerConnectionResource[]> {
    const uniqueMCPServerIds = [...new Set(mcpServerIds)];
    const internalMCPServerIds: string[] = [];
    const remoteMCPServerModelIds: ModelId[] = [];

    for (const mcpServerId of uniqueMCPServerIds) {
      const { serverType, id } = getServerTypeAndIdFromSId(mcpServerId);

      if (serverType === "internal") {
        internalMCPServerIds.push(mcpServerId);
      } else {
        remoteMCPServerModelIds.push(id);
      }
    }

    const serverFilters: WhereOptions<MCPServerConnectionModel>[] = [];

    if (internalMCPServerIds.length > 0) {
      serverFilters.push({
        serverType: "internal",
        internalMCPServerId: {
          [Op.in]: internalMCPServerIds,
        },
      });
    }

    if (remoteMCPServerModelIds.length > 0) {
      serverFilters.push({
        serverType: "remote",
        remoteMCPServerId: {
          [Op.in]: remoteMCPServerModelIds,
        },
      });
    }

    if (serverFilters.length === 0) {
      return [];
    }

    return this.baseFetch(auth, {
      attributes: [
        "id",
        "workspaceId",
        "serverType",
        "internalMCPServerId",
        "remoteMCPServerId",
      ],
      where: {
        connectionType: "workspace",
        [Op.or]: serverFilters,
      },
      includeUser: false,
    });
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

    // Capture fields needed for audit logging before destruction.
    const auditMetadata = {
      sId: this.sId,
      name:
        getInternalMCPServerNameFromSId(this.internalMCPServerId) ??
        this.internalMCPServerId ??
        String(this.remoteMCPServerId ?? "unknown"),
      connectionType: this.connectionType,
      serverType: this.internalMCPServerId ? "internal" : "remote",
      authType: this.connectionId ? "oauth" : "keypair",
      connectionId: this.connectionId,
    };

    try {
      await this.model.destroy({
        where: {
          id: this.id,
          workspaceId: auth.getNonNullableWorkspace().id,
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

      void emitAuditLogEvent({
        auth,
        action: "mcp_connection.deleted",
        targets: [
          buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
          buildAuditLogTarget("mcp_connection", {
            sId: auditMetadata.sId,
            name: auditMetadata.name,
          }),
        ],
        metadata: {
          connection_type: auditMetadata.connectionType,
          server_type: auditMetadata.serverType,
          auth_type: auditMetadata.authType,
        },
      });

      // Only emit oauth.revoked for OAuth-based connections, since keypair
      // connections hold no refresh token to revoke.
      if (auditMetadata.connectionId) {
        void emitAuditLogEvent({
          auth,
          action: "oauth.revoked",
          targets: [
            buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
            buildAuditLogTarget("mcp_connection", {
              sId: auditMetadata.sId,
              name: auditMetadata.name,
            }),
          ],
          metadata: {
            provider: auditMetadata.name,
            connection_id: auditMetadata.connectionId,
            connection_type: auditMetadata.connectionType,
          },
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

  get mcpServerId(): string {
    switch (this.serverType) {
      case "internal": {
        if (!this.internalMCPServerId) {
          throw new Error(
            "This MCP server connection is missing an internal MCP server ID"
          );
        }

        return this.internalMCPServerId;
      }
      case "remote": {
        if (!this.remoteMCPServerId) {
          throw new Error(
            "This MCP server connection is missing a remote MCP server ID"
          );
        }

        return remoteMCPServerNameToSId({
          remoteMCPServerId: this.remoteMCPServerId,
          workspaceId: this.workspaceId,
        });
      }
      default:
        return assertNever(this.serverType);
    }
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
      authType: this.credentialId ? "keypair" : "oauth",
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
  authType: "oauth" | "keypair";
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
