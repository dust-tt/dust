import type { Attributes } from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import { ShareableFileModel } from "@app/lib/resources/storage/models/files";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface ShareableFileResource
  extends ReadonlyAttributesType<ShareableFileModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ShareableFileResource extends BaseResource<ShareableFileModel> {
  static model: ModelStaticWorkspaceAware<ShareableFileModel> =
    ShareableFileModel;

  constructor(
    model: ModelStaticWorkspaceAware<ShareableFileModel>,
    blob: Attributes<ShareableFileModel>
  ) {
    super(ShareableFileModel, blob);
  }

  static async makeNew(blob: Attributes<ShareableFileModel>) {
    const shareableFile = await ShareableFileModel.create(blob);
    return new this(this.model, shareableFile.get());
  }

  async delete(auth: Authenticator): Promise<Result<undefined, Error>> {
    const workspace = auth.getNonNullableWorkspace().id;
    await this.model.destroy({
      where: { id: this.id, workspaceId: workspace },
    });

    return new Ok(undefined);
  }

  static async updatePublicShareScopeToWorkspace(auth: Authenticator) {
    const workspaceId = auth.getNonNullableWorkspace().id;
    return this.model.update(
      { shareScope: "workspace" },
      { where: { workspaceId, shareScope: "public" } }
    );
  }
}
