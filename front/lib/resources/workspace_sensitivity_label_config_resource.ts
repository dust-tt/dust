import type { Authenticator } from "@app/lib/auth";
import type {
  AllowedLabel,
  SensitivityLabelSourceType,
} from "@app/lib/models/workspace_sensitivity_label_config";
import { WorkspaceSensitivityLabelConfigModel } from "@app/lib/models/workspace_sensitivity_label_config";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import type { Attributes, ModelStatic, Transaction } from "sequelize";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface WorkspaceSensitivityLabelConfigResource
  extends ReadonlyAttributesType<WorkspaceSensitivityLabelConfigModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class WorkspaceSensitivityLabelConfigResource extends BaseResource<WorkspaceSensitivityLabelConfigModel> {
  static model: ModelStatic<WorkspaceSensitivityLabelConfigModel> =
    WorkspaceSensitivityLabelConfigModel;

  constructor(
    model: ModelStatic<WorkspaceSensitivityLabelConfigModel>,
    blob: Attributes<WorkspaceSensitivityLabelConfigModel>
  ) {
    super(WorkspaceSensitivityLabelConfigModel, blob);
  }

  static async fetchBySource(
    auth: Authenticator,
    {
      sourceType,
      sourceId,
    }: { sourceType: SensitivityLabelSourceType; sourceId: string }
  ): Promise<WorkspaceSensitivityLabelConfigResource | null> {
    const workspace = auth.getNonNullableWorkspace();
    const blob = await WorkspaceSensitivityLabelConfigModel.findOne({
      where: { workspaceId: workspace.id, sourceType, sourceId },
    });
    if (!blob) {
      return null;
    }
    return new WorkspaceSensitivityLabelConfigResource(
      WorkspaceSensitivityLabelConfigModel,
      blob.get()
    );
  }

  static async upsert(
    auth: Authenticator,
    {
      sourceType,
      sourceId,
      allowedLabels,
    }: {
      sourceType: SensitivityLabelSourceType;
      sourceId: string;
      allowedLabels: AllowedLabel[];
    }
  ): Promise<WorkspaceSensitivityLabelConfigResource> {
    const workspace = auth.getNonNullableWorkspace();
    await WorkspaceSensitivityLabelConfigModel.upsert({
      workspaceId: workspace.id,
      sourceType,
      sourceId,
      allowedLabels,
    });
    const blob = await WorkspaceSensitivityLabelConfigModel.findOne({
      where: { workspaceId: workspace.id, sourceType, sourceId },
    });
    if (!blob) {
      throw new Error("Failed to upsert WorkspaceSensitivityLabelConfig");
    }
    return new WorkspaceSensitivityLabelConfigResource(
      WorkspaceSensitivityLabelConfigModel,
      blob.get()
    );
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<number | undefined, Error>> {
    await this.model.destroy({
      where: {
        id: this.id,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      transaction,
    });
    return new Ok(this.id);
  }

  toLogJSON() {
    return {
      id: this.id,
      sourceType: this.sourceType,
      sourceId: this.sourceId,
    };
  }
}
