import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import type { NotificationCondition } from "@app/types/notification_preferences";
import type { ModelId } from "@app/types/shared/model_id";
import { Err, Ok, type Result } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { Attributes } from "sequelize";
import { Op } from "sequelize";
import { SpaceResource } from "./space_resource";
import { UserProjectPreferencesModel } from "./storage/models/user_project_preferences";
import { makeSId } from "./string_ids";
import type { UserResource } from "./user_resource";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface UserProjectPreferencesResource
  extends ReadonlyAttributesType<UserProjectPreferencesModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class UserProjectPreferencesResource extends BaseResource<UserProjectPreferencesModel> {
  static model: typeof UserProjectPreferencesModel =
    UserProjectPreferencesModel;

  readonly user: UserResource;

  constructor(
    model: typeof UserProjectPreferencesModel,
    blob: Attributes<UserProjectPreferencesModel>,
    { user }: { user: UserResource }
  ) {
    super(UserProjectPreferencesModel, blob);

    this.user = user;
  }

  get sId(): string {
    return UserProjectPreferencesResource.modelIdToSId({
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

  private static async baseFetch(
    auth: Authenticator,
    options: ResourceFindOptions<UserProjectPreferencesModel> = {}
  ): Promise<UserProjectPreferencesResource[]> {
    const { where, ...otherOptions } = options;
    const user = auth.getNonNullableUser();

    const results = await UserProjectPreferencesModel.findAll({
      where: {
        ...where,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      ...otherOptions,
    });

    return results.map((r) => new this(this.model, r.get(), { user }));
  }

  static async fetchNotificationPreferenceMap(
    auth: Authenticator,
    {
      spaceModelId,
      userModelIds,
    }: {
      spaceModelId: ModelId;
      userModelIds: ModelId[];
    }
  ): Promise<Map<ModelId, NotificationCondition>> {
    const preferences = await this.baseFetch(auth, {
      where: {
        spaceId: spaceModelId,
        userId: { [Op.in]: userModelIds },
        notificationPreference: { [Op.ne]: null },
      },
    });

    const preferenceMap = new Map<ModelId, NotificationCondition>();
    for (const preference of preferences) {
      if (preference.notificationPreference !== null) {
        preferenceMap.set(preference.userId, preference.notificationPreference);
      }
    }

    return preferenceMap;
  }

  static async fetchBySpace(
    auth: Authenticator,
    spaceModelId: ModelId
  ): Promise<UserProjectPreferencesResource | null> {
    const [preference] = await this.baseFetch(auth, {
      where: {
        userId: auth.getNonNullableUser().id,
        spaceId: spaceModelId,
      },
    });

    return preference ?? null;
  }

  static async fetchStarred(
    auth: Authenticator,
    { spaceIds }: { spaceIds?: ModelId[] } = {}
  ): Promise<Set<ModelId>> {
    if (spaceIds && spaceIds.length === 0) {
      return new Set();
    }
    const preferences = await this.baseFetch(auth, {
      where: {
        userId: auth.getNonNullableUser().id,
        isStarred: true,
        ...(spaceIds ? { spaceId: { [Op.in]: spaceIds } } : {}),
      },
    });
    return new Set(preferences.map((p) => p.spaceId));
  }

  static async setNotificationPreference(
    auth: Authenticator,
    {
      spaceModelId,
      notificationPreference,
    }: {
      spaceModelId: ModelId;
      notificationPreference: NotificationCondition;
    }
  ): Promise<UserProjectPreferencesResource> {
    const workspace = auth.getNonNullableWorkspace();
    const user = auth.getNonNullableUser();

    const [entry] = await UserProjectPreferencesModel.upsert({
      workspaceId: workspace.id,
      userId: user.id,
      spaceId: spaceModelId,
      notificationPreference,
    });

    return new this(this.model, entry.get(), { user });
  }

  static async setStarred(
    auth: Authenticator,
    {
      spaceModelId,
      isStarred,
    }: {
      spaceModelId: ModelId;
      isStarred: boolean;
    }
  ): Promise<UserProjectPreferencesResource> {
    const workspace = auth.getNonNullableWorkspace();
    const user = auth.getNonNullableUser();

    const [entry] = await UserProjectPreferencesModel.upsert({
      workspaceId: workspace.id,
      userId: user.id,
      spaceId: spaceModelId,
      isStarred,
    });

    return new this(this.model, entry.get(), { user });
  }

  static async deleteAllBySpace(
    auth: Authenticator,
    spaceModelId: ModelId
  ): Promise<Result<undefined, Error>> {
    try {
      await UserProjectPreferencesModel.destroy({
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
      await UserProjectPreferencesModel.destroy({
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
      notificationPreference: this.notificationPreference,
      isStarred: this.isStarred === true,
    };
  }
}
