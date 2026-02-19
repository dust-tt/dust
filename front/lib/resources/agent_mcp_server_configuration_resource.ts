import type { Authenticator } from "@app/lib/auth";
import { AgentMCPServerConfigurationModel } from "@app/lib/models/agent/actions/mcp";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { Attributes, Transaction } from "sequelize";
import { Op } from "sequelize";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface AgentMCPServerConfigurationResource
  extends ReadonlyAttributesType<AgentMCPServerConfigurationModel> {}

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

  static async fetchByIds(
    auth: Authenticator,
    sIds: string[]
  ): Promise<AgentMCPServerConfigurationResource[]> {
    const workspaceId = auth.getNonNullableWorkspace().id;
    const uniqueSIds = Array.from(new Set(sIds));

    if (uniqueSIds.length === 0) {
      return [];
    }

    const configs = await this.model.findAll({
      where: {
        workspaceId,
        sId: {
          [Op.in]: uniqueSIds,
        },
      },
    });

    return configs.map((c) => new this(this.model, c.get()));
  }

  static async fetchById(
    auth: Authenticator,
    sId: string
  ): Promise<AgentMCPServerConfigurationResource | null> {
    const workspaceId = auth.getNonNullableWorkspace().id;

    const config = await this.model.findOne({
      where: {
        workspaceId,
        sId,
      },
    });

    return config ? new this(this.model, config.get()) : null;
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
