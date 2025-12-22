import type { Attributes, Transaction } from "sequelize";
import { Op } from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { AgentMCPServerConfigurationModel } from "@app/lib/models/agent/actions/mcp";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { Result } from "@app/types";
import { Err, normalizeError, Ok } from "@app/types";

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

  static async fetchBySIds(
    auth: Authenticator,
    sIds: string[]
  ): Promise<AgentMCPServerConfigurationResource[]> {
    const workspaceId = auth.getNonNullableWorkspace().id;

    const configs = await this.model.findAll({
      where: {
        workspaceId,
        sId: {
          [Op.in]: sIds,
        },
      },
    });

    return configs.map((c) => new this(this.model, c.get()));
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
