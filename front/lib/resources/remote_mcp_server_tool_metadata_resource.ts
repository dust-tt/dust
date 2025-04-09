import assert from "assert";
import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";

import type { MCPToolPermissionLevelType } from "@app/lib/actions/mcp_metadata";
import type { Authenticator } from "@app/lib/auth";
import { RemoteMCPServerToolMetadataModel } from "@app/lib/models/assistant/actions/remote_mcp_server_tool_metadata";
import { BaseResource } from "@app/lib/resources/base_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import type { Result } from "@app/types";
import { Err, Ok } from "@app/types";

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
    const systemSpace = await SpaceResource.fetchWorkspaceSystemSpace(auth);
    assert(
      systemSpace.canWrite(auth),
      "The user is not authorized to create a tool metadata"
    );

    const toolMetadata = await this.model.create(blob, { transaction });

    return new this(RemoteMCPServerToolMetadataModel, toolMetadata.get());
  }

  // Fetch

  private static async baseFetch(
    auth: Authenticator,
    options: ResourceFindOptions<RemoteMCPServerToolMetadataModel>
  ) {
    const systemSpace = await SpaceResource.fetchWorkspaceSystemSpace(auth);
    assert(systemSpace.canAdministrate(auth),
      "The user is not authorized to fetch tool metadata"
    );

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
    serverId: string,
    options?: ResourceFindOptions<RemoteMCPServerToolMetadataModel>
  ): Promise<RemoteMCPServerToolMetadataResource[]> {
    return this.baseFetch(auth, {
      ...options,
      where: {
        remoteMCPServerId: serverId,
      },
    });
  }

  static async fetchByServerIdAndToolName(
    auth: Authenticator,
    {
      serverId,
      toolName,
    }: {
      serverId: string;
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

  async setPermission(auth: Authenticator, permission: MCPToolPermissionLevelType) {
    const systemSpace = await SpaceResource.fetchWorkspaceSystemSpace(auth);
    assert(
      systemSpace.canWrite(auth),
      "The user is not authorized to update a tool metadata"
    );

    await this.update({
      permission,
    });
  }

  // Delete

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction }
  ): Promise<Result<undefined | number, Error>> {
    const systemSpace = await SpaceResource.fetchWorkspaceSystemSpace(auth);
    assert(
      systemSpace.canWrite(auth),
      "The user is not authorized to delete a tool metadata"
    );

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
}
