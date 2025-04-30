import type { Attributes, ModelStatic, Transaction } from "sequelize";
import { Op } from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import { MembershipModel } from "@app/lib/resources/storage/models/membership";
import {
  UserMetadataModel,
  UserModel,
} from "@app/lib/resources/storage/models/user";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type {
  LightWorkspaceType,
  ModelId,
  Result,
  UserProviderType,
  UserType,
} from "@app/types";
import { Err, Ok } from "@app/types";

export interface SearchMembersPaginationParams {
  orderColumn: "name";
  orderDirection: "asc" | "desc";
  offset: number;
  limit: number;
}

const USER_METADATA_COMMA_SEPARATOR = ",";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// eslint-disable-next-line @typescript-eslint/no-empty-interface, @typescript-eslint/no-unsafe-declaration-merging
export interface UserResource extends ReadonlyAttributesType<UserModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class UserResource extends BaseResource<UserModel> {
  static model: ModelStatic<UserModel> = UserModel;

  constructor(model: ModelStatic<UserModel>, blob: Attributes<UserModel>) {
    super(UserModel, blob);
  }

  static async makeNew(
    blob: Omit<
      Attributes<UserModel>,
      | "id"
      | "createdAt"
      | "updatedAt"
      | "isDustSuperUser"
      | "providerId"
      | "imageUrl"
    > &
      Partial<Pick<Attributes<UserModel>, "providerId" | "imageUrl">>
  ): Promise<UserResource> {
    const lowerCaseEmail = blob.email?.toLowerCase();
    const user = await UserModel.create({ ...blob, email: lowerCaseEmail });
    return new this(UserModel, user.get());
  }

  static async fetchByIds(userIds: string[]): Promise<UserResource[]> {
    const users = await UserModel.findAll({
      where: {
        sId: userIds,
      },
    });

    return users.map((user) => new UserResource(UserModel, user.get()));
  }

  static async fetchByModelIds(ids: ModelId[]): Promise<UserResource[]> {
    const users = await UserModel.findAll({
      where: {
        id: ids,
      },
    });

    return users.map((user) => new UserResource(UserModel, user.get()));
  }

  static async listByUsername(username: string): Promise<UserResource[]> {
    const users = await UserModel.findAll({
      where: {
        username,
      },
    });

    return users.map((user) => new UserResource(UserModel, user.get()));
  }

  static async listByEmail(email: string): Promise<UserResource[]> {
    const users = await UserModel.findAll({
      where: {
        email,
      },
    });

    return users.map((user) => new UserResource(UserModel, user.get()));
  }

  static async fetchById(userId: string): Promise<UserResource | null> {
    const user = await UserModel.findOne({
      where: {
        sId: userId,
      },
    });
    return user ? new UserResource(UserModel, user.get()) : null;
  }

  static async fetchByAuth0Sub(sub: string): Promise<UserResource | null> {
    const user = await UserModel.findOne({
      where: {
        auth0Sub: sub,
      },
    });
    return user ? new UserResource(UserModel, user.get()) : null;
  }

  static async fetchByEmail(email: string): Promise<UserResource | null> {
    const users = await this.listByEmail(email.toLowerCase());
    return users.length > 0 ? users[0] : null;
  }

  static async fetchByProvider(
    provider: UserProviderType,
    providerId: string
  ): Promise<UserResource | null> {
    const user = await UserModel.findOne({
      where: {
        provider,
        providerId,
      },
    });

    return user ? new UserResource(UserModel, user.get()) : null;
  }

  static async getWorkspaceFirstAdmin(
    workspaceId: number
  ): Promise<UserResource | null> {
    const user = await UserModel.findOne({
      include: [
        {
          model: MembershipModel,
          where: {
            role: "admin",
            workspaceId,
          },
          required: true,
        },
      ],
      order: [["createdAt", "ASC"]],
    });

    return user ? new UserResource(UserModel, user.get()) : null;
  }

  async updateAuth0Sub({
    sub,
    provider,
  }: {
    sub: string;
    provider: UserProviderType;
  }) {
    return this.update({
      auth0Sub: sub,
      provider,
    });
  }

  async updateName(firstName: string, lastName: string | null) {
    return this.update({
      firstName,
      lastName,
    });
  }

  async updateInfo(
    username: string,
    firstName: string,
    lastName: string | null,
    email: string
  ) {
    const lowerCaseEmail = email.toLowerCase();
    return this.update({
      username,
      firstName,
      lastName,
      email: lowerCaseEmail,
    });
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction }
  ): Promise<Result<undefined, Error>> {
    await this.deleteAllMetadata();

    try {
      await this.model.destroy({
        where: {
          id: this.id,
        },
        transaction,
      });

      return new Ok(undefined);
    } catch (err) {
      return new Err(err as Error);
    }
  }

  async unsafeDelete(
    transaction?: Transaction
  ): Promise<Result<undefined, Error>> {
    try {
      await this.model.destroy({
        where: {
          id: this.id,
        },
        transaction,
      });

      return new Ok(undefined);
    } catch (err) {
      return new Err(err as Error);
    }
  }

  async getMetadata(key: string) {
    return UserMetadataModel.findOne({
      where: {
        userId: this.id,
        key,
      },
    });
  }

  async setMetadata(key: string, value: string) {
    const metadata = await UserMetadataModel.findOne({
      where: {
        userId: this.id,
        key,
      },
    });

    if (!metadata) {
      await UserMetadataModel.create({
        userId: this.id,
        key,
        value,
      });
      return;
    }

    await metadata.update({ value });
  }

  async appendToMetadata(key: string, value: string) {
    const metadata = await UserMetadataModel.findOne({
      where: {
        userId: this.id,
        key,
      },
    });
    if (!metadata) {
      await UserMetadataModel.create({
        userId: this.id,
        key,
        value,
      });
      return;
    }
    const newValue = `${metadata.value}${USER_METADATA_COMMA_SEPARATOR}${value}`;
    await metadata.update({ value: newValue });
  }

  async deleteAllMetadata() {
    return UserMetadataModel.destroy({
      where: {
        userId: this.id,
      },
    });
  }

  fullName(): string {
    return [this.firstName, this.lastName].filter(Boolean).join(" ");
  }

  toJSON(): UserType {
    return {
      sId: this.sId,
      id: this.id,
      createdAt: this.createdAt.getTime(),
      provider: this.provider,
      username: this.username,
      email: this.email,
      firstName: this.firstName,
      lastName: this.lastName,
      fullName: this.fullName(),
      image: this.imageUrl,
    };
  }

  static async listUserWithExactEmails(
    owner: LightWorkspaceType,
    emails: string[]
  ): Promise<UserResource[]> {
    const users = await UserModel.findAll({
      include: [
        {
          model: MembershipModel,
          as: "memberships",
          where: {
            workspaceId: owner.id,
            startAt: { [Op.lte]: new Date() },
            endAt: { [Op.or]: [{ [Op.eq]: null }, { [Op.gte]: new Date() }] },
          },
          required: true,
        },
      ],
      where: {
        email: emails,
      },
    });

    return users.map((user) => new UserResource(UserModel, user.get()));
  }

  static async listUsersWithEmailPredicat(
    owner: LightWorkspaceType,
    options: {
      email?: string;
    },
    paginationParams: SearchMembersPaginationParams
  ): Promise<{ users: UserResource[]; total: number }> {
    const userWhereClause: any = {};
    if (options.email) {
      userWhereClause.email = {
        [Op.iLike]: `%${options.email}%`,
      };
    }

    const { count, rows: users } = await UserModel.findAndCountAll({
      where: userWhereClause,
      include: [
        {
          model: MembershipModel,
          as: "memberships",
          where: {
            workspaceId: owner.id,
            startAt: { [Op.lte]: new Date() },
            endAt: { [Op.or]: [{ [Op.eq]: null }, { [Op.gte]: new Date() }] },
          },
          required: true,
        },
      ],
      order: [[paginationParams.orderColumn, paginationParams.orderDirection]],
      limit: paginationParams.limit,
      offset: paginationParams.offset,
    });

    return {
      users: users.map((u) => new UserResource(UserModel, u.get())),
      total: count,
    };
  }
}
