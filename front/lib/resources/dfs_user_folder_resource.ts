import type { Authenticator } from "@app/lib/auth";
import { DfsUserFolderModel } from "@app/lib/models/dfs_user_folder";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { UserResource } from "@app/lib/resources/user_resource";
import type { DfsObjectId } from "@app/types/dfs";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import type { Attributes, Transaction } from "sequelize";

export interface DfsUserFolderResource extends ReadonlyAttributesType<DfsUserFolderModel> {}

/** The dfs folder of a user (`users/<userSId>`) in the authenticated workspace's tenant. */
export class DfsUserFolderResource extends BaseResource<DfsUserFolderModel> {
  static model: ModelStaticWorkspaceAware<DfsUserFolderModel> =
    DfsUserFolderModel;

  constructor(
    _model: ModelStaticWorkspaceAware<DfsUserFolderModel>,
    blob: Attributes<DfsUserFolderModel>
  ) {
    super(DfsUserFolderModel, blob);
  }

  static async fetchByUser(
    auth: Authenticator,
    user: UserResource
  ): Promise<DfsUserFolderResource | null> {
    const blob = await DfsUserFolderModel.findOne({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        userId: user.id,
      },
    });
    return blob
      ? new DfsUserFolderResource(DfsUserFolderModel, blob.get())
      : null;
  }

  /** Stores the folder of `user`. Throws if `user` already has one in the workspace. */
  static async makeNew(
    auth: Authenticator,
    { user, dfsObjectId }: { user: UserResource; dfsObjectId: DfsObjectId }
  ): Promise<DfsUserFolderResource> {
    const blob = await DfsUserFolderModel.create({
      workspaceId: auth.getNonNullableWorkspace().id,
      userId: user.id,
      dfsObjectId,
    });
    return new DfsUserFolderResource(DfsUserFolderModel, blob.get());
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<undefined, Error>> {
    await DfsUserFolderModel.destroy({
      where: { id: this.id, workspaceId: auth.getNonNullableWorkspace().id },
      transaction,
    });
    return new Ok(undefined);
  }

  // Workspace hard deletion: rows reference the workspace with `ON DELETE RESTRICT`.
  static async deleteAllForWorkspace(auth: Authenticator): Promise<void> {
    await DfsUserFolderModel.destroy({
      where: { workspaceId: auth.getNonNullableWorkspace().id },
    });
  }
}
