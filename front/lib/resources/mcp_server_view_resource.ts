import assert from "assert";
import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";
import { Op } from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { AgentMCPServerConfiguration } from "@app/lib/models/assistant/actions/mcp";
import { MCPServerView } from "@app/lib/models/assistant/actions/mcp_server_view";
import { RemoteMCPServerResource } from "@app/lib/resources/remote_mcp_servers_resource";
import { ResourceWithSpace } from "@app/lib/resources/resource_with_space";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { UserModel } from "@app/lib/resources/storage/models/user";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { getResourceIdFromSId, makeSId } from "@app/lib/resources/string_ids";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import type { ModelId, Result, UserType } from "@app/types";
import { assertNever, Err, Ok, removeNulls } from "@app/types";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// eslint-disable-next-line @typescript-eslint/no-empty-interface, @typescript-eslint/no-unsafe-declaration-merging
export interface MCPServerViewResource
  extends ReadonlyAttributesType<MCPServerView> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class MCPServerViewResource extends ResourceWithSpace<MCPServerView> {
  static model: ModelStatic<MCPServerView> = MCPServerView;
  readonly editedByUser?: Attributes<UserModel>;

  constructor(
    model: ModelStatic<MCPServerView>,
    blob: Attributes<MCPServerView>,
    space: SpaceResource,
    { editedByUser }: { editedByUser?: Attributes<UserModel> } = {}
  ) {
    super(MCPServerView, blob, space);

    this.editedByUser = editedByUser;
  }
  private static async makeNew(
    auth: Authenticator,
    blob: Omit<
      CreationAttributes<MCPServerView>,
      "editedAt" | "editedByUserId" | "vaultId"
    >,
    space: SpaceResource,
    editedByUser?: UserType | null,
    transaction?: Transaction
  ) {
    assert(auth.isAdmin(), "Only the admin can create an MCP server view");
    const server = await MCPServerView.create(
      {
        ...blob,
        editedByUserId: editedByUser?.id ?? null,
        editedAt: new Date(),
        vaultId: space.id,
      },
      { transaction }
    );
    return new this(MCPServerViewResource.model, server.get(), space);
  }

  // Fetching.

  private static async baseFetch(
    auth: Authenticator,
    { where }: ResourceFindOptions<MCPServerView> = {}
  ) {
    const views = await this.baseFetchWithAuthorization(auth, {
      where,
      includes: [
        {
          model: UserModel,
          as: "editedByUser",
        },
      ],
    });

    return views;
  }

  static async fetchById(
    auth: Authenticator,
    id: string
  ): Promise<Result<MCPServerViewResource, DustError>> {
    const viewRes = await this.fetchByIds(auth, [id]);

    if (viewRes.isErr()) {
      return viewRes;
    }

    return new Ok(viewRes.value[0]);
  }

  static async fetchByIds(
    auth: Authenticator,
    ids: string[]
  ): Promise<Result<MCPServerViewResource[], DustError>> {
    const viewModelIds = removeNulls(ids.map((id) => getResourceIdFromSId(id)));
    if (viewModelIds.length !== ids.length) {
      return new Err(new DustError("invalid_id", "Invalid id"));
    }

    const views = await this.baseFetch(auth, {
      where: {
        id: {
          [Op.in]: viewModelIds,
        },
      },
    });

    if (views.length !== ids.length) {
      return new Err(
        new DustError(
          "resource_not_found",
          ids.length === 1 ? "View not found" : "Some views were not found"
        )
      );
    }

    return new Ok(views);
  }

  static async fetchByModelPk(auth: Authenticator, id: ModelId) {
    const views = await this.fetchByModelIds(auth, [id]);

    if (views.length !== 1) {
      return null;
    }

    return views[0];
  }

  static async fetchByModelIds(auth: Authenticator, ids: ModelId[]) {
    const views = await this.baseFetch(
      auth,

      {
        where: {
          id: {
            [Op.in]: ids,
          },
        },
      }
    );

    return views ?? [];
  }

  static async listByWorkspace({
    auth,
  }: {
    auth: Authenticator;
  }): Promise<MCPServerViewResource[]> {
    return this.baseFetch(auth);
  }

  // Deletion.

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<undefined, Error>> {
    assert(auth.isAdmin(), "Only the admin can delete an MCP server view");

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

  // Deletion.

  protected async softDelete(
    auth: Authenticator,
    transaction?: Transaction
  ): Promise<Result<number, Error>> {
    const deletedCount = await MCPServerView.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        id: this.id,
      },
      transaction,
      hardDelete: false,
    });

    return new Ok(deletedCount);
  }

  async hardDelete(
    auth: Authenticator,
    transaction?: Transaction
  ): Promise<Result<number, Error>> {
    // Delete agent configurations elements pointing to this data source view.
    await AgentMCPServerConfiguration.destroy({
      where: {
        mcpServerViewId: this.id,
      },
      transaction,
    });

    const deletedCount = await MCPServerView.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        id: this.id,
      },
      transaction,
      // Use 'hardDelete: true' to ensure the record is permanently deleted from the database,
      // bypassing the soft deletion in place.
      hardDelete: true,
    });

    return new Ok(deletedCount);
  }

  async getRemoteMCPServer(
    auth: Authenticator
  ): Promise<RemoteMCPServerResource> {
    if (this.serverType !== "remote") {
      throw new Error("This MCP server view is not a remote server view");
    }

    if (!this.remoteMCPServerId) {
      throw new Error("This MCP server view is missing a remote server ID");
    }

    const remoteMCPServer = await RemoteMCPServerResource.findByPk(
      auth,
      this.remoteMCPServerId
    );
    if (!remoteMCPServer) {
      throw new Error(
        "This MCP server view is referencing a non-existent remote server"
      );
    }

    return remoteMCPServer;
  }

  get sId(): string {
    return MCPServerViewResource.modelIdToSId({
      id: this.id,
      workspaceId: this.workspaceId,
    });
  }

  get mcpServerId(): string {
    if (this.serverType === "remote") {
      if (!this.remoteMCPServerId) {
        throw new Error("This MCP server view is missing a remote server ID");
      }

      return RemoteMCPServerResource.modelIdToSId({
        id: this.remoteMCPServerId,
        workspaceId: this.workspaceId,
      });
    } else if (this.serverType === "internal") {
      if (!this.internalMCPServerId) {
        throw new Error(
          "This MCP server view is missing an internal server ID"
        );
      }

      return this.internalMCPServerId;
    } else {
      assertNever(this.serverType);
    }
  }

  static modelIdToSId({
    id,
    workspaceId,
  }: {
    id: ModelId;
    workspaceId: ModelId;
  }): string {
    return makeSId("mcp_server_view", {
      id,
      workspaceId,
    });
  }

  // Serialization.
  toJSON(): MCPServerViewType {
    return {
      sId: this.sId,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      mcpServerId: this.mcpServerId,
      spaceId: this.space.sId,
    };
  }
}

export interface MCPServerViewType {
  sId: string;
  createdAt: Date;
  updatedAt: Date;
  mcpServerId: string;
  spaceId: string | null;
}
