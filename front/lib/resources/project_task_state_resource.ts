import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import { ProjectTaskStateModel } from "@app/lib/resources/storage/models/project_task_state";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { makeSId } from "@app/lib/resources/string_ids";
import type { ModelId } from "@app/types/shared/model_id";
import { Ok, type Result } from "@app/types/shared/result";
import type { Attributes, ModelStatic, Transaction } from "sequelize";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface ProjectTaskStateResource
  extends ReadonlyAttributesType<ProjectTaskStateModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ProjectTaskStateResource extends BaseResource<ProjectTaskStateModel> {
  static model: ModelStaticWorkspaceAware<ProjectTaskStateModel> =
    ProjectTaskStateModel;

  constructor(
    model: ModelStatic<ProjectTaskStateModel>,
    blob: Attributes<ProjectTaskStateModel>
  ) {
    super(ProjectTaskStateModel, blob);
  }

  // Returns the state for a given (space, user) pair, or null if the user has
  // never opened the tasks panel for this space.
  static async fetchBySpace(
    auth: Authenticator,
    { spaceId }: { spaceId: ModelId },
    transaction?: Transaction
  ): Promise<ProjectTaskStateResource | null> {
    const row = await ProjectTaskStateModel.findOne({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        spaceId,
        userId: auth.getNonNullableUser().id,
      },
      transaction,
    });

    return row ? new this(ProjectTaskStateModel, row.get()) : null;
  }

  static async fetchAllBySpace(
    auth: Authenticator,
    { spaceId }: { spaceId: ModelId },
    transaction?: Transaction
  ): Promise<ProjectTaskStateResource[]> {
    const models = await ProjectTaskStateModel.findAll({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        spaceId,
      },
      transaction,
    });

    return models.map((model) => new this(ProjectTaskStateModel, model.get()));
  }

  // Creates or updates the last-read timestamp for a (space, user) pair. Call
  // this when the user opens or acknowledges the tasks panel.
  static async upsertBySpace(
    auth: Authenticator,
    { spaceId, lastReadAt }: { spaceId: ModelId; lastReadAt: Date },
    transaction?: Transaction
  ): Promise<ProjectTaskStateResource> {
    const workspaceId = auth.getNonNullableWorkspace().id;
    const userId = auth.getNonNullableUser().id;

    const [row, created] = await ProjectTaskStateModel.findOrCreate({
      where: { workspaceId, spaceId, userId },
      defaults: {
        workspaceId,
        spaceId,
        userId,
        lastReadAt,
      },
      transaction,
    });

    if (!created) {
      await row.update({ lastReadAt }, { transaction });
    }

    return new this(ProjectTaskStateModel, row.get());
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction }
  ): Promise<Result<undefined, Error>> {
    await this.model.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        id: this.id,
      },
      transaction,
    });

    return new Ok(undefined);
  }

  get sId(): string {
    return ProjectTaskStateResource.modelIdToSId({
      id: this.id,
      workspaceId: this.workspaceId,
    });
  }

  static modelIdToSId({
    id,
    workspaceId,
  }: {
    id: ModelId;
    workspaceId: ModelId;
  }): string {
    return makeSId("project_task_state", { id, workspaceId });
  }
}
