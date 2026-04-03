import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import { ProjectTodoStateModel } from "@app/lib/resources/storage/models/project_todo_state";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { makeSId } from "@app/lib/resources/string_ids";
import type { ModelId } from "@app/types/shared/model_id";
import { Ok, type Result } from "@app/types/shared/result";
import type { Attributes, ModelStatic, Transaction } from "sequelize";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface ProjectTodoStateResource
  extends ReadonlyAttributesType<ProjectTodoStateModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ProjectTodoStateResource extends BaseResource<ProjectTodoStateModel> {
  static model: ModelStaticWorkspaceAware<ProjectTodoStateModel> =
    ProjectTodoStateModel;

  constructor(
    model: ModelStatic<ProjectTodoStateModel>,
    blob: Attributes<ProjectTodoStateModel>
  ) {
    super(ProjectTodoStateModel, blob);
  }

  // Returns the state for a given (space, user) pair, or null if the user has
  // never opened the todos panel for this space.
  static async fetchBySpace(
    auth: Authenticator,
    { spaceId }: { spaceId: ModelId },
    transaction?: Transaction
  ): Promise<ProjectTodoStateResource | null> {
    const row = await ProjectTodoStateModel.findOne({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        spaceId,
        userId: auth.getNonNullableUser().id,
      },
      transaction,
    });

    return row ? new this(ProjectTodoStateModel, row.get()) : null;
  }

  // Creates or updates the last-read timestamp for a (space, user) pair. Call
  // this when the user opens or acknowledges the todos panel.
  static async upsertBySpace(
    auth: Authenticator,
    { spaceId, lastReadAt }: { spaceId: ModelId; lastReadAt: Date },
    transaction?: Transaction
  ): Promise<ProjectTodoStateResource> {
    const workspaceId = auth.getNonNullableWorkspace().id;

    const [row] = await ProjectTodoStateModel.upsert(
      {
        workspaceId,
        spaceId,
        userId: auth.getNonNullableUser().id,
        lastReadAt,
      },
      { transaction, returning: true }
    );

    return new this(ProjectTodoStateModel, row.get());
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
    return ProjectTodoStateResource.modelIdToSId({
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
    return makeSId("project_todo_state", { id, workspaceId });
  }
}
