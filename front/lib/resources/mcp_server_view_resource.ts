import assert from "assert";
import { tracer } from "dd-trace";
import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";
import { Op } from "sequelize";

import {
  autoInternalMCPServerNameToSId,
  getServerTypeAndIdFromSId,
  remoteMCPServerNameToSId,
} from "@app/lib/actions/mcp_helper";
import { isEnabledForWorkspace } from "@app/lib/actions/mcp_internal_actions";
import type {
  AutoInternalMCPServerNameType,
  MCPServerAvailability,
} from "@app/lib/actions/mcp_internal_actions/constants";
import {
  AVAILABLE_INTERNAL_MCP_SERVER_NAMES,
  getAvailabilityOfInternalMCPServerById,
  getAvailabilityOfInternalMCPServerByName,
  isAutoInternalMCPServerName,
  isValidInternalMCPServerId,
} from "@app/lib/actions/mcp_internal_actions/constants";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { MCPServerViewModel } from "@app/lib/models/assistant/actions/mcp_server_view";
import { destroyMCPServerViewDependencies } from "@app/lib/models/assistant/actions/mcp_server_view_helper";
import { RemoteMCPServerToolMetadataModel } from "@app/lib/models/assistant/actions/remote_mcp_server_tool_metadata";
import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { RemoteMCPServerResource } from "@app/lib/resources/remote_mcp_servers_resource";
import { ResourceWithSpace } from "@app/lib/resources/resource_with_space";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { UserModel } from "@app/lib/resources/storage/models/user";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { getResourceIdFromSId, makeSId } from "@app/lib/resources/string_ids";
import type {
  InferIncludeType,
  ResourceFindOptions,
} from "@app/lib/resources/types";
import type { UserResource } from "@app/lib/resources/user_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { MCPOAuthUseCase, ModelId, Result } from "@app/types";
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
  readonly internalToolsMetadata?: Attributes<RemoteMCPServerToolMetadataModel>[];
  readonly remoteToolsMetadata?: Attributes<RemoteMCPServerToolMetadataModel>[];
  private remoteMCPServer?: RemoteMCPServerResource;
  private internalMCPServer?: InternalMCPServerInMemoryResource;

  constructor(
    model: ModelStatic<MCPServerViewModel>,
    blob: Attributes<MCPServerViewModel>,
    space: SpaceResource,
    includes?: Partial<InferIncludeType<MCPServerViewModel>>
  ) {
    super(MCPServerViewModel, blob, space);

    this.editedByUser = includes?.editedByUser;
    this.internalToolsMetadata = includes?.internalToolsMetadata;
    this.remoteToolsMetadata = includes?.remoteToolsMetadata;
  }

  private async init(
    auth: Authenticator,
    systemSpace: SpaceResource
  ): Promise<Result<void, DustError>> {
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
        this.internalMCPServerId,
        systemSpace
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
    const systemSpace = await SpaceResource.fetchWorkspaceSystemSpace(auth);
    const r = await resource.init(auth, systemSpace);
    if (r.isErr()) {
      throw r.error;
    }

    return resource;
  }

  public static async create(
    auth: Authenticator,
    {
      systemView,
      space,
    }: {
      systemView: MCPServerViewResource;
      space: SpaceResource;
    }
  ) {
    if (systemView.space.kind !== "system") {
      throw new Error(
        "You must pass the system view to create a new MCP server view"
      );
    }

    const mcpServerId = systemView.mcpServerId;
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
        // Always copy the oAuthUseCase, name and description from the system view to the custom view.
        // This way, it's always available on the MCP server view without having to fetch the system view.
        oAuthUseCase: systemView.oAuthUseCase,
        name: systemView.name,
        description: systemView.description,
      },
      space,
      auth.user() ?? undefined
    );
  }

  // Fetching.

  private static async baseFetch(
    auth: Authenticator,
    options: ResourceFindOptions<MCPServerViewModel> = {}
  ) {
    const views = await this.baseFetchWithAuthorization(auth, {
      ...options,
      where: {
        ...options.where,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      includes: [
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        ...(options.includes || []),
        {
          model: UserModel,
          as: "editedByUser",
        },
        {
          model: RemoteMCPServerToolMetadataModel,
          as: "internalToolsMetadata",
          required: false,
          where: {
            workspaceId: auth.getNonNullableWorkspace().id,
          },
        },
        {
          model: RemoteMCPServerToolMetadataModel,
          as: "remoteToolsMetadata",
          required: false,
          where: {
            workspaceId: auth.getNonNullableWorkspace().id,
          },
        },
      ],
    });

    const filteredViews: MCPServerViewResource[] = [];

    // If we are including deleted views, it's probably for the deletion activity.
    // We can just return the views and ignore the related mcp server state.
    if (options.includeDeleted) {
      filteredViews.push(...views);
    } else {
      const systemSpace = await SpaceResource.fetchWorkspaceSystemSpace(auth);
      await concurrentExecutor(
        views,
        async (view) => {
          const r = await view.init(auth, systemSpace);
          if (r.isOk()) {
            filteredViews.push(view);
          }
        },
        { concurrency: 10 }
      );
    }

    return filteredViews;
  }

  static async fetchById(
    auth: Authenticator,
    id: string,
    options?: ResourceFindOptions<MCPServerViewModel>
  ): Promise<MCPServerViewResource | null> {
    const [mcpServerView] = await this.fetchByIds(auth, [id], options);

    return mcpServerView ?? null;
  }

  static async fetchByIds(
    auth: Authenticator,
    ids: string[],
    options?: ResourceFindOptions<MCPServerViewModel>
  ): Promise<MCPServerViewResource[]> {
    const viewModelIds = removeNulls(ids.map((id) => getResourceIdFromSId(id)));

    const views = await this.baseFetch(auth, {
      ...options,
      where: {
        ...options?.where,
        id: {
          [Op.in]: viewModelIds,
        },
      },
    });

    return views ?? [];
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
    auth: Authenticator,
    options?: ResourceFindOptions<MCPServerViewModel>
  ): Promise<MCPServerViewResource[]> {
    return this.baseFetch(auth, options);
  }

  static async listBySpaces(
    auth: Authenticator,
    spaces: SpaceResource[],
    options?: ResourceFindOptions<MCPServerViewModel>
  ): Promise<MCPServerViewResource[]> {
    return this.baseFetch(auth, {
      ...options,
      where: {
        ...options?.where,
        workspaceId: auth.getNonNullableWorkspace().id,
        vaultId: spaces.map((s) => s.id),
      },
      order: [["id", "ASC"]],
    });
  }

  static async listBySpace(
    auth: Authenticator,
    space: SpaceResource,
    options?: ResourceFindOptions<MCPServerViewModel>
  ): Promise<MCPServerViewResource[]> {
    return this.listBySpaces(auth, [space], options);
  }

  static async listForSystemSpace(
    auth: Authenticator,
    options?: ResourceFindOptions<MCPServerViewModel>
  ) {
    const systemSpace = await SpaceResource.fetchWorkspaceSystemSpace(auth);

    return this.listBySpace(auth, systemSpace, options);
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

  // Auto internal MCP server are supposed to be created in the global space.
  // They can be null if ensureAllAutoToolsAreCreated has not been called.
  static async getMCPServerViewForAutoInternalTool(
    auth: Authenticator,
    name: AutoInternalMCPServerNameType
  ) {
    const views = await this.listByMCPServer(
      auth,
      autoInternalMCPServerNameToSId({
        name,
        workspaceId: auth.getNonNullableWorkspace().id,
      })
    );

    return views.find((view) => view.space.kind === "global") ?? null;
  }

  static async getMCPServerViewForSystemSpace(
    auth: Authenticator,
    mcpServerId: string
  ): Promise<MCPServerViewResource | null> {
    const systemSpace = await SpaceResource.fetchWorkspaceSystemSpace(auth);
    const { serverType, id } = getServerTypeAndIdFromSId(mcpServerId);
    if (serverType === "internal") {
      const views = await this.baseFetch(auth, {
        where: {
          serverType: "internal",
          internalMCPServerId: mcpServerId,
          vaultId: systemSpace.id,
        },
      });
      return views[0] ?? null;
    } else {
      const views = await this.baseFetch(auth, {
        where: {
          serverType: "remote",
          remoteMCPServerId: id,
          vaultId: systemSpace.id,
        },
      });
      return views[0] ?? null;
    }
  }

  static async getMCPServerViewForGlobalSpace(
    auth: Authenticator,
    mcpServerId: string
  ): Promise<MCPServerViewResource | null> {
    const globalSpace = await SpaceResource.fetchWorkspaceGlobalSpace(auth);
    const { serverType, id } = getServerTypeAndIdFromSId(mcpServerId);
    if (serverType === "internal") {
      const views = await this.baseFetch(auth, {
        where: {
          serverType: "internal",
          internalMCPServerId: mcpServerId,
          vaultId: globalSpace.id,
        },
      });
      return views[0] ?? null;
    } else {
      const views = await this.baseFetch(auth, {
        where: {
          serverType: "remote",
          remoteMCPServerId: id,
          vaultId: globalSpace.id,
        },
      });
      return views[0] ?? null;
    }
  }

  public async updateOAuthUseCase(
    auth: Authenticator,
    oAuthUseCase: MCPOAuthUseCase
  ): Promise<Result<number, DustError<"unauthorized">>> {
    if (!this.canAdministrate(auth)) {
      return new Err(
        new DustError("unauthorized", "Not allowed to update OAuth use case.")
      );
    }

    const [affectedCount] = await this.update({
      oAuthUseCase,
      editedAt: new Date(),
      editedByUserId: auth.getNonNullableUser().id,
    });
    return new Ok(affectedCount);
  }

  public async updateNameAndDescription(
    auth: Authenticator,
    name?: string,
    description?: string
  ): Promise<Result<number, DustError<"unauthorized">>> {
    if (!this.canAdministrate(auth)) {
      return new Err(
        new DustError(
          "unauthorized",
          "Not allowed to update name and description."
        )
      );
    }

    const [affectedCount] = await this.update({
      name,
      description,
      editedAt: new Date(),
      editedByUserId: auth.getNonNullableUser().id,
    });
    return new Ok(affectedCount);
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

  private getRemoteMCPServerResource(): RemoteMCPServerResource {
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

  private getInternalMCPServerResource(): InternalMCPServerInMemoryResource {
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

  get availability(): MCPServerAvailability {
    if (this.serverType !== "internal" || !this.internalMCPServerId) {
      return "manual";
    }

    return getAvailabilityOfInternalMCPServerById(this.internalMCPServerId);
  }

  static async ensureAllAutoToolsAreCreated(auth: Authenticator) {
    return tracer.trace("ensureAllAutoToolsAreCreated", async () => {
      const names = AVAILABLE_INTERNAL_MCP_SERVER_NAMES;

      const autoInternalMCPServerIds: string[] = [];
      for (const name of names) {
        if (!isAutoInternalMCPServerName(name)) {
          continue;
        }

        const isEnabled = await isEnabledForWorkspace(auth, name);
        const availability = getAvailabilityOfInternalMCPServerByName(name);

        if (isEnabled && availability !== "manual") {
          autoInternalMCPServerIds.push(
            autoInternalMCPServerNameToSId({
              name,
              workspaceId: auth.getNonNullableWorkspace().id,
            })
          );
        }
      }

      if (autoInternalMCPServerIds.length === 0) {
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
            [Op.in]: autoInternalMCPServerIds,
          },
          vaultId: { [Op.in]: spaces.map((s) => s.id) },
        },
      });

      // Quick check : there should be 2 views for each default internal mcp server (ensured by unique constraint), if so
      // no need to check further
      if (views.length !== autoInternalMCPServerIds.length * 2) {
        const systemSpace = spaces.find((s) => s.isSystem());
        const globalSpace = spaces.find((s) => s.isGlobal());

        if (!systemSpace || !globalSpace) {
          throw new Error(
            "System or global space not found. Should never happen."
          );
        }

        // Create the missing views
        for (const id of autoInternalMCPServerIds) {
          // Check if exists in system space.
          let systemViewModel = views.find(
            (v) => v.internalMCPServerId === id && v.vaultId === systemSpace.id
          );
          if (!systemViewModel) {
            systemViewModel = await MCPServerViewModel.create({
              workspaceId: auth.getNonNullableWorkspace().id,
              serverType: "internal",
              internalMCPServerId: id,
              vaultId: systemSpace.id,
              editedAt: new Date(),
              editedByUserId: auth.user()?.id,
              oAuthUseCase: null,
            });
          }
          const systemView = new this(
            MCPServerViewModel,
            systemViewModel.get(),
            systemSpace
          );

          // Check if exists in global space.
          const isInGlobalSpace = views.some(
            (v) => v.internalMCPServerId === id && v.vaultId === globalSpace.id
          );
          if (!isInGlobalSpace) {
            await MCPServerViewResource.create(auth, {
              systemView,
              space: globalSpace,
            });
          }
        }
      }
    });
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
      id: this.id,
      sId: this.sId,
      name: this.name,
      description: this.description,
      createdAt: this.createdAt.getTime(),
      updatedAt: this.updatedAt.getTime(),
      spaceId: this.space.sId,
      serverType: this.serverType,
      server:
        this.serverType === "remote"
          ? this.getRemoteMCPServerResource().toJSON()
          : this.getInternalMCPServerResource().toJSON(),
      oAuthUseCase: this.oAuthUseCase,
      editedByUser: this.makeEditedBy(
        this.editedByUser,
        this.remoteMCPServer ? this.remoteMCPServer.updatedAt : this.updatedAt
      ),
      toolsMetadata: [
        ...(this.internalToolsMetadata ?? []).map((t) => ({
          toolName: t.toolName,
          permission: t.permission,
          enabled: t.enabled,
        })),
        ...(this.remoteToolsMetadata ?? []).map((t) => ({
          toolName: t.toolName,
          permission: t.permission,
          enabled: t.enabled,
        })),
      ],
    };
  }
}
