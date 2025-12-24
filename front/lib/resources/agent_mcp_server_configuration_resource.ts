import type { Attributes, Transaction } from "sequelize";
import { Op } from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { AgentMCPServerConfigurationModel } from "@app/lib/models/agent/actions/mcp";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { ModelId, Result } from "@app/types";
import { Err, normalizeError, Ok } from "@app/types";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface AgentMCPServerConfigurationResource extends ReadonlyAttributesType<AgentMCPServerConfigurationModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class AgentMCPServerConfigurationResource extends BaseResource<AgentMCPServerConfigurationModel> {
  static model: ModelStaticWorkspaceAware<AgentMCPServerConfigurationModel> =
    AgentMCPServerConfigurationModel;

  constructor(
    model: ModelStaticWorkspaceAware<AgentMCPServerConfigurationModel>,
    blob: Attributes<AgentMCPServerConfigurationModel>
  ) {
    super(model, blob);
  }

  /**
   * Fetch configurations by their numeric ModelIds.
   * Note: AgentMCPActionModel.mcpServerConfigurationId stores IDs as strings
   */
  static async fetchByModelIds(
    auth: Authenticator,
    modelIds: ModelId[]
  ): Promise<AgentMCPServerConfigurationResource[]> {
    const workspaceId = auth.getNonNullableWorkspace().id;

    const configs = await this.model.findAll({
      where: {
        workspaceId,
        id: {
          [Op.in]: modelIds,
        },
      },
    });

    return configs.map((c) => new this(this.model, c.get()));
  }

  static async fetchByModelIdsAsStrings(
    auth: Authenticator,
    stringIds: string[]
  ): Promise<AgentMCPServerConfigurationResource[]> {
    const modelIds = stringIds
      .map((id) => parseInt(id, 10))
      .filter((id) => !isNaN(id));

    return this.fetchByModelIds(auth, modelIds);
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<undefined, Error>> {
    const workspaceId = auth.getNonNullableWorkspace().id;
    try {
      await AgentMCPServerConfigurationModel.destroy({
        where: {
          workspaceId,
          id: this.id,
        },
        transaction,
      });
      return new Ok(undefined);
    } catch (err) {
      return new Err(normalizeError(err));
    }
  }
}
