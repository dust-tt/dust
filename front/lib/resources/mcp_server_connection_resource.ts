import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";

import { MCPServerConfigurationType } from "@app/lib/actions/mcp";
import type { Authenticator } from "@app/lib/auth";
import { MCPServerConnection } from "@app/lib/models/assistant/actions/mcp_server_connection";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelId, Result } from "@app/types";
import { Err, Ok } from "@app/types";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// eslint-disable-next-line @typescript-eslint/no-empty-interface, @typescript-eslint/no-unsafe-declaration-merging
export interface MCPServerConnectionResource
  extends ReadonlyAttributesType<MCPServerConnection> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class MCPServerConnectionResource extends BaseResource<MCPServerConnection> {
  static model: ModelStatic<MCPServerConnection> = MCPServerConnection;

  constructor(
    model: ModelStatic<MCPServerConnection>,
    blob: Attributes<MCPServerConnection>
  ) {
    super(MCPServerConnection, blob);
  }

  static async makeNew(blob: CreationAttributes<MCPServerConnection>) {
    const server = await MCPServerConnection.create(blob);
    return new this(MCPServerConnection, server.get());
  }

  // Fetching.

  static async findByWorkspaceAndMCPServer({
    auth,
    remoteMCPServerId,
    internalMCPServerId,
  }:
    | {
        auth: Authenticator;
        internalMCPServerId: undefined;
        remoteMCPServerId: ModelId;
      }
    | {
        auth: Authenticator;
        internalMCPServerId: MCPServerConfigurationType["internalMCPServerId"];
        remoteMCPServerId: undefined;
      }): Promise<MCPServerConnectionResource | null> {
    const owner = auth.workspace();

    if (!owner) {
      return null;
    }

    const connection = await this.model.findOne({
      where: {
        workspaceId: owner.id,
        ...(remoteMCPServerId
          ? { remoteMCPServerId, serverType: "remote" }
          : { internalMCPServerId, serverType: "internal" }),
      },
    });

    return connection
      ? new MCPServerConnectionResource(MCPServerConnection, connection.get())
      : null;
  }

  // Deletion.

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<undefined, Error>> {
    try {
      await this.model.destroy({
        where: {
          id: this.id,
        },
        transaction,
      });
      return new Ok(undefined);
    } catch (err) {
      return new Err(err as Error);
    }
  }

  // Serialization.
  toJSON() {
    return {
      id: this.id,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      connectionId: this.connectionId,
      connectionType: this.connectionType,
      serverType: this.serverType,
      internalMCPServerId: this.internalMCPServerId,
      remoteMCPServerId: this.remoteMCPServerId,
    };
  }
}
