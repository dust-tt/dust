import type { Attributes, Transaction } from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { ConversationModel } from "@app/lib/models/agent/conversation";
import { BaseResource } from "@app/lib/resources/base_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { SpaceModel } from "@app/lib/resources/storage/models/spaces";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { UserProjectDigestModel } from "@app/lib/resources/storage/models/user_project_digest";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { makeSId } from "@app/lib/resources/string_ids";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { UserProjectDigestType } from "@app/types/user_project_digest";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface UserProjectDigestResource
  extends ReadonlyAttributesType<UserProjectDigestModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class UserProjectDigestResource extends BaseResource<UserProjectDigestModel> {
  static model: typeof UserProjectDigestModel = UserProjectDigestModel;

  readonly user: Attributes<UserModel>;

  constructor(
    model: typeof UserProjectDigestModel,
    blob: Attributes<UserProjectDigestModel>,
    { user }: { user: Attributes<UserModel> }
  ) {
    super(UserProjectDigestModel, blob);

    this.user = user;
  }

  get sId(): string {
    return UserProjectDigestResource.modelIdToSId({
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
    return makeSId("user_project_digest", {
      id,
      workspaceId,
    });
  }

  static async create(
    auth: Authenticator,
    {
      spaceId,
      digest,
      sourceConversationId,
      transaction,
    }: {
      spaceId: ModelId;
      digest: string;
      sourceConversationId?: ModelId | null;
      transaction?: Transaction;
    }
  ): Promise<UserProjectDigestResource> {
    const workspace = auth.getNonNullableWorkspace();
    const user = auth.getNonNullableUser();

    const entry = await UserProjectDigestModel.create(
      {
        workspaceId: workspace.id,
        spaceId,
        userId: user.id,
        digest,
        sourceConversationId: sourceConversationId ?? null,
      },
      { transaction }
    );

    return new this(this.model, entry.get(), { user });
  }

  static async fetchBySpace(
    auth: Authenticator,
    spaceId: ModelId,
    options?: {
      limit?: number;
      offset?: number;
      transaction?: Transaction;
    }
  ): Promise<UserProjectDigestResource[]> {
    const rows = await UserProjectDigestModel.findAll({
      where: {
        spaceId,
        userId: auth.getNonNullableUser().id,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      include: [
        {
          model: SpaceModel,
          required: true,
        },
        {
          model: ConversationModel,
          required: false,
        },
        {
          model: UserModel,
          required: true,
        },
      ],
      order: [["createdAt", "DESC"]],
      limit: options?.limit,
      offset: options?.offset,
      transaction: options?.transaction,
    });

    return rows.map((r) => {
      return new this(this.model, r.get(), { user: auth.getNonNullableUser() });
    });
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction }
  ): Promise<Result<undefined, Error>> {
    try {
      await UserProjectDigestModel.destroy({
        where: {
          id: this.id,
          userId: auth.getNonNullableUser().id,
          workspaceId: auth.getNonNullableWorkspace().id,
        },
        transaction,
      });
      return new Ok(undefined);
    } catch (error) {
      return new Err(error as Error);
    }
  }

  toJSON(): UserProjectDigestType {
    return {
      sId: this.sId,
      id: this.id,
      createdAt: this.createdAt.getTime(),
      updatedAt: this.updatedAt.getTime(),
      spaceId: SpaceResource.modelIdToSId({
        id: this.spaceId,
        workspaceId: this.workspaceId,
      }),
      userId: this.user.sId,
      digest: this.digest,
    };
  }
}
