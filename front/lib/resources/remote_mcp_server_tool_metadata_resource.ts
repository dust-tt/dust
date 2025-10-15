import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";
import { Op } from "sequelize";

import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import { getServerTypeAndIdFromSId } from "@app/lib/actions/mcp_helper";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { RemoteMCPServerToolMetadataModel } from "@app/lib/models/assistant/actions/remote_mcp_server_tool_metadata";
import { BaseResource } from "@app/lib/resources/base_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import type { Result } from "@app/types";
import { Err, Ok } from "@app/types";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface, @typescript-eslint/no-unsafe-declaration-merging
export interface RemoteMCPServerToolMetadataResource
  extends ReadonlyAttributesType<RemoteMCPServerToolMetadataModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class RemoteMCPServerToolMetadataResource extends BaseResource<RemoteMCPServerToolMetadataModel> {
  static model: ModelStatic<RemoteMCPServerToolMetadataModel> =
    RemoteMCPServerToolMetadataModel;

  constructor(
    model: typeof RemoteMCPServerToolMetadataModel,
    blob: Attributes<RemoteMCPServerToolMetadataModel>
  ) {
    super(RemoteMCPServerToolMetadataModel, blob);
  }

  // Creation

  static async makeNew(
    auth: Authenticator,
    blob: CreationAttributes<RemoteMCPServerToolMetadataModel>,
    transaction?: Transaction
  ) {
    const canAdministrate =
      await SpaceResource.canAdministrateSystemSpace(auth);

    if (!canAdministrate) {
      throw new DustError(
        "unauthorized",
        "The user is not authorized to create a tool metadata"
      );
    }

    const toolMetadata = await this.model.create(
      {
        ...blob,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      { transaction }
    );

    return new this(RemoteMCPServerToolMetadataModel, toolMetadata.get());
  }

  // Fetch

  private static async baseFetch(
    auth: Authenticator,
    options: ResourceFindOptions<RemoteMCPServerToolMetadataModel>
  ) {
    const { where, ...opts } = options;

    const toolMetadata = await RemoteMCPServerToolMetadataModel.findAll({
      where: {
        ...where,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      ...opts,
    });

    return toolMetadata.map(
      (tool) => new this(RemoteMCPServerToolMetadataModel, tool.get())
    );
  }

  static async fetchByServerId(
    auth: Authenticator,
    serverSId: string,
    options?: ResourceFindOptions<RemoteMCPServerToolMetadataModel>
  ): Promise<RemoteMCPServerToolMetadataResource[]> {
    const { serverType, id: serverId } = getServerTypeAndIdFromSId(serverSId);
    return this.baseFetch(auth, {
      ...options,
      where:
        serverType === "remote"
          ? { remoteMCPServerId: serverId }
          : { internalMCPServerId: serverSId },
    });
  }

  static async fetchByServerIdAndToolName(
    auth: Authenticator,
    {
      serverId,
      toolName,
    }: {
      serverId: number;
      toolName: string;
    },
    options?: ResourceFindOptions<RemoteMCPServerToolMetadataModel>
  ): Promise<RemoteMCPServerToolMetadataResource | null> {
    const toolMetadata = await this.baseFetch(auth, {
      ...options,
      where: {
        remoteMCPServerId: serverId,
        toolName,
      },
    });

    if (toolMetadata.length === 0) {
      return null;
    }

    return toolMetadata[0];
  }

  // Update

  static async updateOrCreateSettings(
    auth: Authenticator,
    {
      serverSId,
      toolName,
      permission,
      enabled,
    }: {
      serverSId: string;
      toolName: string;
      permission: MCPToolStakeLevelType;
      enabled: boolean;
    }
  ) {
    const canAdministrate =
      await SpaceResource.canAdministrateSystemSpace(auth);

    if (!canAdministrate) {
      throw new DustError(
        "unauthorized",
        "The user is not authorized to update a tool metadata"
      );
    }

    const { serverType, id: serverId } = getServerTypeAndIdFromSId(serverSId);
    const [toolMetadata] = await this.model.upsert({
      ...(serverType === "remote"
        ? { remoteMCPServerId: serverId }
        : { internalMCPServerId: serverSId }),
      toolName,
      permission,
      enabled,
      workspaceId: auth.getNonNullableWorkspace().id,
    });

    return new this(this.model, toolMetadata.get());
  }

  // Deletes tool metadata for tools that are not in the list
  static async deleteStaleTools(
    auth: Authenticator,
    {
      serverId,
      toolsToKeep: tools,
    }: {
      serverId: number;
      toolsToKeep: string[];
    }
  ) {
    const canAdministrate =
      await SpaceResource.canAdministrateSystemSpace(auth);

    if (!canAdministrate) {
      throw new DustError(
        "unauthorized",
        "The user is not authorized to delete a tool metadata"
      );
    }
    await RemoteMCPServerToolMetadataModel.destroy({
      where: {
        remoteMCPServerId: serverId,
        workspaceId: auth.getNonNullableWorkspace().id,
        toolName: {
          [Op.notIn]: tools,
        },
      },
    });
  }

  // Delete

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction }
  ): Promise<Result<undefined | number, Error>> {
    const canAdministrate =
      await SpaceResource.canAdministrateSystemSpace(auth);

    if (!canAdministrate) {
      throw new DustError(
        "unauthorized",
        "The user is not authorized to delete a tool metadata"
      );
    }

    const result = await RemoteMCPServerToolMetadataModel.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        id: this.id,
      },
      transaction,
    });

    if (result === 0) {
      return new Err(new Error("Failed to delete the tool metadata"));
    }

    return new Ok(result);
  }

  // toJSON

  toJSON(): {
    remoteMCPServerId?: number;
    internalMCPServerId?: string;
    toolName: string;
    permission: MCPToolStakeLevelType;
    enabled: boolean;
  } {
    return {
      remoteMCPServerId: this.remoteMCPServerId,
      internalMCPServerId: this.internalMCPServerId,
      toolName: this.toolName,
      permission: this.permission,
      enabled: this.enabled,
    };
  }
}
