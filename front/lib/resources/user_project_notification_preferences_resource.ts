import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { NotificationCondition } from "@app/types/notification_preferences";
import type { ModelId } from "@app/types/shared/model_id";
import { Err, Ok, type Result } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { Attributes } from "sequelize";
import { Op } from "sequelize";
import { SpaceResource } from "./space_resource";
import { UserProjectNotificationPreferenceModel } from "./storage/models/user_project_notification_preferences";
import { makeSId } from "./string_ids";
import type { UserResource } from "./user_resource";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface UserProjectNotificationPreferenceResource
  extends ReadonlyAttributesType<UserProjectNotificationPreferenceModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class UserProjectNotificationPreferenceResource extends BaseResource<UserProjectNotificationPreferenceModel> {
  static model: typeof UserProjectNotificationPreferenceModel =
    UserProjectNotificationPreferenceModel;

  readonly user: UserResource;

  constructor(
    model: typeof UserProjectNotificationPreferenceModel,
    blob: Attributes<UserProjectNotificationPreferenceModel>,
    { user }: { user: UserResource }
  ) {
    super(UserProjectNotificationPreferenceModel, blob);

    this.user = user;
  }

  get sId(): string {
    return UserProjectNotificationPreferenceResource.modelIdToSId({
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
    return makeSId("user_project_notification_preference", {
      id,
      workspaceId,
    });
  }

  static async create(
    auth: Authenticator,
    {
      spaceModelId,
      preference,
    }: {
      spaceModelId: ModelId;
      preference: NotificationCondition;
    }
  ): Promise<UserProjectNotificationPreferenceResource> {
    const workspace = auth.getNonNullableWorkspace();
    const user = auth.getNonNullableUser();

    const entry = await UserProjectNotificationPreferenceModel.create({
      workspaceId: workspace.id,
      spaceId: spaceModelId,
      userId: user.id,
      preference,
    });

    return new this(this.model, entry.get(), {
      user,
    });
  }

  static async fetchAllBySpaceAndUsers(
    auth: Authenticator,
    {
      spaceModelId,
      userModelIds,
    }: {
      spaceModelId: ModelId;
      userModelIds: ModelId[];
    }
  ): Promise<Map<ModelId, NotificationCondition>> {
    const results = await UserProjectNotificationPreferenceModel.findAll({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        spaceId: spaceModelId,
        userId: { [Op.in]: userModelIds },
      },
    });

    const preferenceMap = new Map<ModelId, NotificationCondition>();
    for (const result of results) {
      preferenceMap.set(result.userId, result.preference);
    }

    return preferenceMap;
  }

  static async fetchByProject(
    auth: Authenticator,
    spaceModelId: ModelId
  ): Promise<UserProjectNotificationPreferenceResource | null> {
    const user = auth.getNonNullableUser();
    const result = await UserProjectNotificationPreferenceModel.findOne({
      where: {
        userId: user.id,
        workspaceId: auth.getNonNullableWorkspace().id,
        spaceId: spaceModelId,
      },
    });

    return result ? new this(this.model, result.get(), { user }) : null;
  }

  static async setPreference(
    auth: Authenticator,
    {
      spaceModelId,
      preference,
    }: {
      spaceModelId: ModelId;
      preference: NotificationCondition;
    }
  ): Promise<UserProjectNotificationPreferenceResource> {
    const workspace = auth.getNonNullableWorkspace();
    const user = auth.getNonNullableUser();

    const [entry] = await UserProjectNotificationPreferenceModel.upsert({
      userId: user.id,
      workspaceId: workspace.id,
      spaceId: spaceModelId,
      preference,
    });

    return new this(this.model, entry.get(), { user });
  }

  static async deleteAllBySpace(
    auth: Authenticator,
    spaceModelId: ModelId
  ): Promise<Result<undefined, Error>> {
    try {
      await UserProjectNotificationPreferenceModel.destroy({
        where: {
          workspaceId: auth.getNonNullableWorkspace().id,
          spaceId: spaceModelId,
        },
      });
      return new Ok(undefined);
    } catch (error) {
      return new Err(normalizeError(error));
    }
  }

  async delete(auth: Authenticator): Promise<Result<undefined, Error>> {
    try {
      await UserProjectNotificationPreferenceModel.destroy({
        where: {
          id: this.id,
          userId: auth.getNonNullableUser().id,
          workspaceId: auth.getNonNullableWorkspace().id,
        },
      });
      return new Ok(undefined);
    } catch (error) {
      return new Err(normalizeError(error));
    }
  }

  toJSON() {
    return {
      id: this.id,
      sId: this.sId,
      spaceId: SpaceResource.modelIdToSId({
        id: this.spaceId,
        workspaceId: this.workspaceId,
      }),
      userId: this.user.sId,
      preference: this.preference,
    };
  }
}
