import type { Authenticator } from "@app/lib/auth";
import { AgentUserRelationModel } from "@app/lib/models/agent/agent";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import type { Attributes, Transaction } from "sequelize";

export class AgentUserRelationResource extends BaseResource<AgentUserRelationModel> {
  static model: ModelStaticWorkspaceAware<AgentUserRelationModel> =
    AgentUserRelationModel;

  constructor(
    model: ModelStaticWorkspaceAware<AgentUserRelationModel>,
    blob: Attributes<AgentUserRelationModel>
  ) {
    super(model, blob);
  }

  static async deleteForAgent(
    auth: Authenticator,
    agentId: string
  ): Promise<void> {
    await this.model.destroy({
      where: {
        agentConfiguration: agentId,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
    });
  }

  static async deleteForAgents(
    agentIds: string[],
    {
      workspaceId,
      transaction,
    }: { workspaceId: ModelId; transaction?: Transaction }
  ): Promise<void> {
    await this.model.destroy({
      where: {
        agentConfiguration: agentIds,
        workspaceId,
      },
      transaction,
    });
  }

  static async countForAgent(
    auth: Authenticator,
    agentId: string
  ): Promise<number> {
    return this.model.count({
      where: {
        agentConfiguration: agentId,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
    });
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<undefined, Error>> {
    await this.model.destroy({
      where: {
        id: this.id,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      transaction,
    });

    return new Ok(undefined);
  }
}
