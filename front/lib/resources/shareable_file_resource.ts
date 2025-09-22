import type { Attributes } from "sequelize";
import { Op } from "sequelize";

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
    const shareableFile = await this.model.create(blob);
    return new this(this.model, shareableFile.get());
  }

  async delete(auth: Authenticator): Promise<Result<undefined, Error>> {
    const workspace = auth.getNonNullableWorkspace().id;
    await this.model.destroy({
      where: { id: this.id, workspaceId: workspace },
    });

    return new Ok(undefined);
  }

  static async fetchAllPublicFilesForWorkspace(auth: Authenticator) {
    const workspace = auth.getNonNullableWorkspace().id;
    const shareableFiles = await this.model.findAll({
      where: { workspaceId: workspace, shareScope: "public" },
    });

    return shareableFiles.map(
      (shareableFile) => new this(this.model, shareableFile.get())
    );
  }

  static async updateShareScopeToWorkspace(
    auth: Authenticator,
    shareableFiles: ShareableFileResource[]
  ) {
    const workspace = auth.getNonNullableWorkspace().id;
    await this.model.update(
      { shareScope: "workspace" },
      {
        where: {
          workspaceId: workspace,
          id: {
            [Op.in]: shareableFiles.map((shareableFile) => shareableFile.id),
          },
        },
      }
    );
  }

  static async updatePublicShareScopeToWorkspace(auth: Authenticator) {
    const workspace = auth.getNonNullableWorkspace().id;
    await this.model.update(
      { shareScope: "workspace" },
      { where: { workspaceId: workspace, shareScope: "public" } }
    );
  }
}
