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
import type { RemoteAllowedIconType } from "@app/lib/actions/mcp_icons";
import type { MCPServerType, MCPToolType } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import { MCPServerViewModel } from "@app/lib/models/assistant/actions/mcp_server_view";
import { destroyMCPServerViewDependencies } from "@app/lib/models/assistant/actions/mcp_server_view_helper";
import { RemoteMCPServerModel } from "@app/lib/models/assistant/actions/remote_mcp_server";
import { RemoteMCPServerToolMetadataModel } from "@app/lib/models/assistant/actions/remote_mcp_server_tool_metadata";
import { BaseResource } from "@app/lib/resources/base_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { getResourceIdFromSId } from "@app/lib/resources/string_ids";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { Result } from "@app/types";
import { Ok, redactString, removeNulls } from "@app/types";

const SECRET_REDACTION_COOLDOWN_IN_MINUTES = 10;

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// eslint-disable-next-line @typescript-eslint/no-empty-interface, @typescript-eslint/no-unsafe-declaration-merging
export interface RemoteMCPServerResource
  extends ReadonlyAttributesType<RemoteMCPServerModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class RemoteMCPServerResource extends BaseResource<RemoteMCPServerModel> {
  static model: ModelStatic<RemoteMCPServerModel> = RemoteMCPServerModel;

  constructor(
    model: ModelStatic<RemoteMCPServerModel>,
    blob: Attributes<RemoteMCPServerModel>
  ) {
    super(RemoteMCPServerModel, blob);
  }

  static async makeNew(
    auth: Authenticator,
    blob: Omit<
      CreationAttributes<RemoteMCPServerModel>,
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

    const server = await RemoteMCPServerModel.create(
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
    await MCPServerViewModel.create(
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

    return new this(RemoteMCPServerModel, server.get());
  }

  // Fetching.

  private static async baseFetch(
    auth: Authenticator,
    options?: ResourceFindOptions<RemoteMCPServerModel>
  ) {
    const { where, ...otherOptions } = options ?? {};

    const servers = await RemoteMCPServerModel.findAll({
      where: {
        ...where,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      ...otherOptions,
    });

    return servers.map(
      (server) => new this(RemoteMCPServerModel, server.get())
    );
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
    options?: ResourceFindOptions<RemoteMCPServerModel>
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
    const mcpServerViews = await MCPServerViewModel.findAll({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        remoteMCPServerId: this.id,
      },
    });

    const serverToolMetadatas = await RemoteMCPServerToolMetadataModel.findAll({
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
    await MCPServerViewModel.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        remoteMCPServerId: this.id,
      },
      // Use 'hardDelete: true' to ensure the record is permanently deleted from the database,
      // bypassing the soft deletion in place.
      hardDelete: true,
    });

    const deletedCount = await RemoteMCPServerModel.destroy({
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
      icon?: RemoteAllowedIconType;
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
    const currentTime = new Date();
    const createdAt = new Date(this.createdAt);
    const timeDifference = Math.abs(
      currentTime.getTime() - createdAt.getTime()
    );
    const differenceInMinutes = Math.ceil(timeDifference / (1000 * 60));
    const secret =
      differenceInMinutes > SECRET_REDACTION_COOLDOWN_IN_MINUTES
        ? redactString(this.sharedSecret, 4)
        : this.sharedSecret;

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
      availability: "manual", // So far we don't have auto remote MCP servers.

      // Remote MCP Server specifics
      url: this.url,
      lastSyncAt: this.lastSyncAt?.getTime() ?? null,
      sharedSecret: secret,
    };
  }
}
