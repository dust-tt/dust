import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { OnboardingTaskKind } from "@app/lib/resources/storage/models/onboarding_tasks";
import { OnboardingTaskModel } from "@app/lib/resources/storage/models/onboarding_tasks";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { getResourceIdFromSId, makeSId } from "@app/lib/resources/string_ids";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import type { ModelId, Result, UserType } from "@app/types";
import { Ok, removeNulls } from "@app/types";

type OnboardingTaskStatus = "to_do" | "achieved" | "skipped";

type OnboardingTaskType = {
  sId: string;
  context: string;
  kind: OnboardingTaskKind;
  toolName: string | null;
  status: OnboardingTaskStatus;
  createdAt: Date;
  updatedAt: Date;
};

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface, @typescript-eslint/no-unsafe-declaration-merging
export interface OnboardingTaskResource
  extends ReadonlyAttributesType<OnboardingTaskModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class OnboardingTaskResource extends BaseResource<OnboardingTaskModel> {
  static model: ModelStaticWorkspaceAware<OnboardingTaskModel> =
    OnboardingTaskModel;

  constructor(
    model: ModelStatic<OnboardingTaskModel>,
    blob: Attributes<OnboardingTaskModel>
  ) {
    super(OnboardingTaskModel, blob);
  }

  static async makeNew(
    auth: Authenticator,
    blob: CreationAttributes<OnboardingTaskModel>,
    transaction?: Transaction
  ) {
    const task = await OnboardingTaskModel.create(
      {
        ...blob,
        workspaceId: auth.getNonNullableWorkspace().id,
        userId: auth.getNonNullableUser().id,
      },
      { transaction }
    );

    return new this(OnboardingTaskModel, task.get());
  }

  private static async baseFetch(
    auth: Authenticator,
    options?: ResourceFindOptions<OnboardingTaskModel>,
    transaction?: Transaction
  ): Promise<OnboardingTaskResource[]> {
    const { where, ...otherOptions } = options ?? {};

    const tasks = await OnboardingTaskModel.findAll({
      where: {
        ...where,
        workspaceId: auth.getNonNullableWorkspace().id,
        userId: auth.getNonNullableUser().id,
      },
      ...otherOptions,
      transaction,
    });

    return tasks.map((t) => new this(OnboardingTaskModel, t.get()));
  }

  static async fetchAllForUserAndWorkspaceInAuth(
    auth: Authenticator
  ): Promise<OnboardingTaskResource[]> {
    return this.baseFetch(auth, {
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        userId: auth.getNonNullableUser().id,
      },
    });
  }

  static async fetchById(
    auth: Authenticator,
    sId: string
  ): Promise<OnboardingTaskResource | null> {
    const tasks = await this.fetchByIds(auth, [sId]);
    if (tasks.length === 0) {
      return null;
    }
    return tasks[0];
  }

  static async fetchByIds(
    auth: Authenticator,
    sIds: string[]
  ): Promise<OnboardingTaskResource[]> {
    const modelIds = removeNulls(sIds.map(getResourceIdFromSId));

    return this.baseFetch(auth, {
      where: {
        id: modelIds,
      },
    });
  }

  async markCompleted(
    transaction?: Transaction
  ): Promise<Result<OnboardingTaskResource, Error>> {
    await this.update(
      {
        completedAt: new Date(),
        skippedAt: null,
      },
      transaction
    );
    return new Ok(this);
  }

  async markSkipped(
    transaction?: Transaction
  ): Promise<Result<OnboardingTaskResource, Error>> {
    await this.update(
      {
        skippedAt: new Date(),
        completedAt: null,
      },
      transaction
    );
    return new Ok(this);
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction }
  ): Promise<Result<undefined, Error>> {
    await this.model.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        userId: auth.getNonNullableUser().id,
        id: this.id,
      },
      transaction,
    });

    return new Ok(undefined);
  }

  // This one is not taking the user from the auth object, since it's used from an admin auth object without a user.
  static async deleteAllForUser(
    auth: Authenticator,
    user: UserType
  ): Promise<void> {
    await this.model.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        userId: user.id,
      },
    });
  }

  static async deleteAllForWorkspace(auth: Authenticator): Promise<undefined> {
    await this.model.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
      },
    });
  }

  getStatus(): OnboardingTaskStatus {
    if (this.completedAt !== null) {
      return "achieved";
    }
    if (this.skippedAt !== null) {
      return "skipped";
    }
    return "to_do";
  }

  get sId(): string {
    return OnboardingTaskResource.modelIdToSId({
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
    return makeSId("onboarding_task", {
      id,
      workspaceId,
    });
  }

  toJSON(): OnboardingTaskType {
    return {
      sId: this.sId,
      context: this.context,
      kind: this.kind,
      toolName: this.toolName,
      status: this.getStatus(),
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
