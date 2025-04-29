import assert from "assert";
import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";
import { Op } from "sequelize";

import {
  getServerTypeAndIdFromSId,
  internalMCPServerNameToSId,
  remoteMCPServerNameToSId,
} from "@app/lib/actions/mcp_helper";
import { isEnabledForWorkspace } from "@app/lib/actions/mcp_internal_actions";
import {
  AVAILABLE_INTERNAL_MCP_SERVER_NAMES,
  isDefaultInternalMCPServer,
  isDefaultInternalMCPServerByName,
  isValidInternalMCPServerId,
} from "@app/lib/actions/mcp_internal_actions/constants";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { MCPServerViewModel } from "@app/lib/models/assistant/actions/mcp_server_view";
import { destroyMCPServerViewDependencies } from "@app/lib/models/assistant/actions/mcp_server_view_helper";
import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { RemoteMCPServerResource } from "@app/lib/resources/remote_mcp_servers_resource";
import { ResourceWithSpace } from "@app/lib/resources/resource_with_space";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { UserModel } from "@app/lib/resources/storage/models/user";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { getResourceIdFromSId, makeSId } from "@app/lib/resources/string_ids";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import type { UserResource } from "@app/lib/resources/user_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { ModelId, Result } from "@app/types";
import {
  assertNever,
  Err,
  formatUserFullName,
  Ok,
  removeNulls,
} from "@app/types";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// eslint-disable-next-line @typescript-eslint/no-empty-interface, @typescript-eslint/no-unsafe-declaration-merging
export interface MCPServerViewResource
  extends ReadonlyAttributesType<MCPServerViewModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class MCPServerViewResource extends ResourceWithSpace<MCPServerViewModel> {
  static model: ModelStatic<MCPServerViewModel> = MCPServerViewModel;
  readonly editedByUser?: Attributes<UserModel>;
  private remoteMCPServer?: RemoteMCPServerResource;
  private internalMCPServer?: InternalMCPServerInMemoryResource;

  constructor(
    model: ModelStatic<MCPServerViewModel>,
    blob: Attributes<MCPServerViewModel>,
    space: SpaceResource,
    { editedByUser }: { editedByUser?: Attributes<UserModel> } = {}
  ) {
    super(MCPServerViewModel, blob, space);

    this.editedByUser = editedByUser;
  }

  private async init(auth: Authenticator): Promise<Result<void, DustError>> {
    if (this.remoteMCPServerId) {
      const remoteServer = await RemoteMCPServerResource.findByPk(
        auth,
        this.remoteMCPServerId
      );
      if (!remoteServer) {
        return new Err(
          new DustError(
            "remote_server_not_found",
            "Remote server not found, it should have been fetched by the base fetch."
          )
        );
      }

      this.remoteMCPServer = remoteServer;
      return new Ok(undefined);
    }

    if (this.internalMCPServerId) {
      const internalServer = await InternalMCPServerInMemoryResource.fetchById(
        auth,
        this.internalMCPServerId
      );
      if (!internalServer) {
        return new Err(
          new DustError(
            "internal_server_not_found",
            "Internal server not found, it might have been deleted from the list of internal servers. Action: clear the mcp server views of orphan internal servers."
          )
        );
      }
      this.internalMCPServer = internalServer;
      return new Ok(undefined);
    }

    return new Err(
      new DustError(
        "internal_error",
        "We could not find the server because it was of an unknown type, this should never happen."
      )
    );
  }

  private static async makeNew(
    auth: Authenticator,
    blob: Omit<
      CreationAttributes<MCPServerViewModel>,
      "editedAt" | "editedByUserId" | "vaultId" | "workspaceId"
    >,
    space: SpaceResource,
    editedByUser?: UserResource,
    transaction?: Transaction
  ) {
    assert(auth.isAdmin(), "Only the admin can create an MCP server view");

    if (blob.internalMCPServerId) {
      assert(
        isValidInternalMCPServerId(
          auth.getNonNullableWorkspace().id,
          blob.internalMCPServerId
        ),
        "Invalid internal MCP server ID"
      );
    }

    const server = await MCPServerViewModel.create(
      {
        ...blob,
        workspaceId: auth.getNonNullableWorkspace().id,
        editedByUserId: editedByUser?.id ?? null,
        editedAt: new Date(),
        vaultId: space.id,
      },
      { transaction }
    );

    const resource = new this(MCPServerViewResource.model, server.get(), space);

    const r = await resource.init(auth);
    if (r.isErr()) {
      throw r.error;
    }

    return resource;
  }

  public static async create(
    auth: Authenticator,
    {
      mcpServerId,
      space,
      transaction,
    }: {
      mcpServerId: string;
      space: SpaceResource;
      transaction?: Transaction;
    }
  ) {
    const { serverType, id } = getServerTypeAndIdFromSId(mcpServerId);

    if (space.kind === "global") {
      const mcpServerViews = await this.listByMCPServer(auth, mcpServerId);
      for (const mcpServerView of mcpServerViews) {
        if (mcpServerView.space.kind === "regular") {
          await mcpServerView.delete(auth, { hardDelete: true });
        }
      }
    }

    return this.makeNew(
      auth,
      {
        serverType,
        internalMCPServerId: serverType === "internal" ? mcpServerId : null,
        remoteMCPServerId: serverType === "remote" ? id : null,
      },
      space,
      auth.user() ?? undefined,
      transaction
    );
  }

  // Fetching.

  private static async baseFetch(
    auth: Authenticator,
    { where }: ResourceFindOptions<MCPServerViewModel> = {}
  ) {
    const views = await this.baseFetchWithAuthorization(auth, {
      where: {
        ...where,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      includes: [
        {
          model: UserModel,
          as: "editedByUser",
        },
      ],
    });

    const filteredViews: MCPServerViewResource[] = [];
    await concurrentExecutor(
      views,
      async (view) => {
        const r = await view.init(auth);
        if (r.isOk()) {
          filteredViews.push(view);
        }
      },
      { concurrency: 10 }
    );

    return filteredViews;
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

  static async listByWorkspace(
    auth: Authenticator
  ): Promise<MCPServerViewResource[]> {
    return this.baseFetch(auth);
  }

  static async listBySpaces(auth: Authenticator, spaces: SpaceResource[]) {
    return this.baseFetch(auth, {
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        vaultId: spaces.map((s) => s.id),
      },
    });
  }

  static async listBySpace(
    auth: Authenticator,
    space: SpaceResource
  ): Promise<MCPServerViewResource[]> {
    return this.listBySpaces(auth, [space]);
  }

  static async countBySpace(
    auth: Authenticator,
    space: SpaceResource
  ): Promise<number> {
    if (space.canRead(auth)) {
      return this.model.count({
        where: {
          workspaceId: auth.getNonNullableWorkspace().id,
          vaultId: space.id,
        },
      });
    }
    return 0;
  }

  static async listByMCPServer(
    auth: Authenticator,
    mcpServerId: string
  ): Promise<MCPServerViewResource[]> {
    const { serverType, id } = getServerTypeAndIdFromSId(mcpServerId);
    if (serverType === "internal") {
      return this.baseFetch(auth, {
        where: { serverType: "internal", internalMCPServerId: mcpServerId },
      });
    } else {
      return this.baseFetch(auth, {
        where: { serverType: "remote", remoteMCPServerId: id },
      });
    }
  }

  // Deletion.

  protected async softDelete(
    auth: Authenticator,
    transaction?: Transaction
  ): Promise<Result<number, Error>> {
    assert(auth.isAdmin(), "Only the admin can delete an MCP server view");
    assert(
      auth.getNonNullableWorkspace().id === this.workspaceId,
      "Can only delete MCP server views for the current workspace"
    );

    const deletedCount = await MCPServerViewModel.destroy({
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
    await destroyMCPServerViewDependencies(auth, {
      mcpServerViewId: this.id,
      transaction,
    });

    const deletedCount = await MCPServerViewModel.destroy({
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

  getRemoteMCPServerResource(): RemoteMCPServerResource {
    if (this.serverType !== "remote") {
      throw new Error("This MCP server view is not a remote server view");
    }

    if (!this.remoteMCPServerId) {
      throw new Error("This MCP server view is missing a remote server ID");
    }

    if (!this.remoteMCPServer) {
      throw new Error(
        "This MCP server view is referencing a non-existent remote server"
      );
    }

    return this.remoteMCPServer;
  }

  getInternalMCPServerResource(): InternalMCPServerInMemoryResource {
    if (this.serverType !== "internal") {
      throw new Error("This MCP server view is not an internal server view");
    }

    if (!this.internalMCPServerId) {
      throw new Error("This MCP server view is missing an internal server ID");
    }

    if (!this.internalMCPServer) {
      throw new Error(
        "This MCP server view is referencing a non-existent internal server"
      );
    }

    return this.internalMCPServer;
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

      return remoteMCPServerNameToSId({
        remoteMCPServerId: this.remoteMCPServerId,
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

  get isDefault(): boolean {
    if (this.serverType !== "internal" || !this.internalMCPServerId) {
      return false;
    }

    return isDefaultInternalMCPServer(this.internalMCPServerId);
  }

  static async ensureAllDefaultActionsAreCreated(auth: Authenticator) {
    const names = AVAILABLE_INTERNAL_MCP_SERVER_NAMES;

    const defaultInternalMCPServerIds: string[] = [];
    for (const name of names) {
      const isEnabled = await isEnabledForWorkspace(auth, name);
      const isDefault = isDefaultInternalMCPServerByName(name);

      if (isEnabled && isDefault) {
        defaultInternalMCPServerIds.push(
          internalMCPServerNameToSId({
            name,
            workspaceId: auth.getNonNullableWorkspace().id,
          })
        );
      }
    }

    if (defaultInternalMCPServerIds.length === 0) {
      return;
    }

    // TODO(mcp): Think this through and determine how / when we create the default internal mcp server views
    // For now, only admins can create the default internal mcp server views otherwise, we would have an assert error
    if (!auth.isAdmin()) {
      return;
    }

    // Get system and global spaces
    const spaces = await SpaceResource.listWorkspaceDefaultSpaces(auth);

    // There should be MCPServerView for theses ids both in system and global spaces
    const views = await MCPServerViewModel.findAll({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        serverType: "internal",
        internalMCPServerId: {
          [Op.in]: defaultInternalMCPServerIds,
        },
        vaultId: { [Op.in]: spaces.map((s) => s.id) },
      },
    });

    // Quick check : there should be 2 views for each default internal mcp server (ensured by unique constraint), if so
    // no need to check further
    if (views.length !== defaultInternalMCPServerIds.length * 2) {
      const systemSpace = spaces.find((s) => s.isSystem());
      const globalSpace = spaces.find((s) => s.isGlobal());

      if (!systemSpace || !globalSpace) {
        throw new Error(
          "System or global space not found. Should never happen."
        );
      }

      // Create the missing views
      for (const id of defaultInternalMCPServerIds) {
        // Check if exists in system space.
        const isInSystemSpace = views.some(
          (v) => v.internalMCPServerId === id && v.vaultId === systemSpace.id
        );
        if (!isInSystemSpace) {
          await MCPServerViewResource.create(auth, {
            mcpServerId: id,
            space: systemSpace,
          });
        }

        // Check if exists in global space.
        const isInGlobalSpace = views.some(
          (v) => v.internalMCPServerId === id && v.vaultId === globalSpace.id
        );
        if (!isInGlobalSpace) {
          await MCPServerViewResource.create(auth, {
            mcpServerId: id,
            space: globalSpace,
          });
        }
      }
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

  async setEditedBy(auth: Authenticator) {
    await this.update({
      editedByUserId: auth.user()?.id ?? null,
      editedAt: new Date(),
    });
  }

  private makeEditedBy(
    editedByUser: Attributes<UserModel> | undefined,
    editedAt: Date | undefined
  ) {
    if (!editedByUser || !editedAt) {
      return null;
    }

    return {
      editedAt: editedAt.getTime(),
      fullName: formatUserFullName(editedByUser),
      imageUrl: editedByUser.imageUrl,
      email: editedByUser.email,
      userId: editedByUser.sId,
    };
  }

  // Serialization.
  toJSON(): MCPServerViewType {
    return {
      id: this.sId,
      createdAt: this.createdAt.getTime(),
      updatedAt: this.updatedAt.getTime(),
      spaceId: this.space.sId,
      server:
        this.serverType === "remote"
          ? this.getRemoteMCPServerResource().toJSON()
          : this.getInternalMCPServerResource().toJSON(),
      editedByUser: this.makeEditedBy(
        this.editedByUser,
        this.remoteMCPServer ? this.remoteMCPServer.updatedAt : this.updatedAt
      ),
    };
  }
}
