import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import { WorkspaceSandboxEnvVarModel } from "@app/lib/resources/storage/models/workspace_sandbox_env_var";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import type { Attributes, ModelStatic, Transaction } from "sequelize";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface WorkspaceSandboxEnvVarResource
  extends ReadonlyAttributesType<WorkspaceSandboxEnvVarModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class WorkspaceSandboxEnvVarResource extends BaseResource<WorkspaceSandboxEnvVarModel> {
  static model: ModelStaticWorkspaceAware<WorkspaceSandboxEnvVarModel> =
    WorkspaceSandboxEnvVarModel;

  constructor(
    model: ModelStatic<WorkspaceSandboxEnvVarModel>,
    blob: Attributes<WorkspaceSandboxEnvVarModel>
  ) {
    super(WorkspaceSandboxEnvVarModel, blob);
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<undefined, Error>> {
    await WorkspaceSandboxEnvVarModel.destroy({
      where: {
        id: this.id,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      transaction,
    });
    return new Ok(undefined);
  }

  static async deleteAllForWorkspace(auth: Authenticator): Promise<undefined> {
    await this.model.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
      },
    });
  }
}
