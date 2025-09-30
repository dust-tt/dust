import { escape } from "html-escaper";
import type {
  Attributes,
  ModelStatic,
  Transaction,
  WhereOptions,
} from "sequelize";
import { Op } from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import type { ResourceLogJSON } from "@app/lib/resources/base_resource";
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
import { Err, normalizeError, Ok } from "@app/types";

export interface SearchMembersPaginationParams {
  orderColumn: "name";
  orderDirection: "asc" | "desc";
  offset: number;
  limit: number;
}

const USER_METADATA_COMMA_SEPARATOR = ",";
const USER_METADATA_COMMA_REPLACEMENT = "DUST_COMMA";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// eslint-disable-next-line @typescript-eslint/no-empty-interface, @typescript-eslint/no-unsafe-declaration-merging
export interface UserResource extends ReadonlyAttributesType<UserModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class UserResource extends BaseResource<UserModel> {
  static model: ModelStatic<UserModel> = UserModel;

  readonly memberships?: MembershipModel[];

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

  static async fetchById(
    userId: string,
    transaction?: Transaction
  ): Promise<UserResource | null> {
    const user = await UserModel.findOne({
      where: {
        sId: userId,
      },
      transaction,
    });
    return user ? new UserResource(UserModel, user.get()) : null;
  }

  static async fetchByWorkOSUserId(
    workOSUserId: string,
    transaction?: Transaction
  ): Promise<UserResource | null> {
    const user = await UserModel.findOne({
      where: {
        workOSUserId,
      },
      transaction,
    });
    return user ? new UserResource(UserModel, user.get()) : null;
  }

  static async fetchByEmail(email: string): Promise<UserResource | null> {
    const users = await this.listByEmail(email.toLowerCase());
    const sortedUsers = users.sort((a, b) => {
      // Best effort strategy as user db entries are not updated often.
      return b.updatedAt.getTime() - a.updatedAt.getTime();
    });

    // Most recently updated user if any.
    return sortedUsers[0] ?? null;
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

  async updateWorkOSUserId({ workOSUserId }: { workOSUserId: string }) {
    return this.update({
      workOSUserId,
    });
  }

  async updateName(firstName: string, lastName: string | null) {
    firstName = escape(firstName);
    if (lastName) {
      lastName = escape(lastName);
    }
    return this.update({
      firstName,
      lastName,
    });
  }

  async updateInfo(
    username: string,
    firstName: string,
    lastName: string | null,
    email: string,
    workOSUserId: string | null
  ) {
    firstName = escape(firstName);
    if (lastName) {
      lastName = escape(lastName);
    }
    const lowerCaseEmail = email.toLowerCase();
    return this.update({
      username,
      firstName,
      lastName,
      email: lowerCaseEmail,
      workOSUserId,
    });
  }

  async recordLoginActivity(date?: Date) {
    return this.update({
      lastLoginAt: date ?? new Date(),
    });
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
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
      return new Err(normalizeError(err));
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
      return new Err(normalizeError(err));
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

  async deleteMetadata(where: WhereOptions<UserMetadataModel>) {
    return UserMetadataModel.destroy({
      where: {
        ...where,
        userId: this.id,
      },
    });
  }

  async getMetadataAsArray(key: string): Promise<string[]> {
    const metadata = await this.getMetadata(key);
    if (!metadata) {
      return [];
    }

    return metadata.value
      .split(USER_METADATA_COMMA_SEPARATOR)
      .map((v) => v.replaceAll(USER_METADATA_COMMA_REPLACEMENT, ","));
  }

  async upsertMetadataArray(key: string, value: string) {
    const valueWithCommaReplaced = value.replaceAll(
      ",",
      USER_METADATA_COMMA_REPLACEMENT
    );
    const metadata = await this.getMetadata(key);
    if (!metadata) {
      await UserMetadataModel.create({
        userId: this.id,
        key,
        value: valueWithCommaReplaced,
      });
      return;
    }

    const metadataArray = metadata.value
      .split(USER_METADATA_COMMA_SEPARATOR)
      .map((v) => v.replace(USER_METADATA_COMMA_REPLACEMENT, ","));

    if (!metadataArray.includes(valueWithCommaReplaced)) {
      metadataArray.push(valueWithCommaReplaced);
    }

    await metadata.update({
      value: metadataArray.join(USER_METADATA_COMMA_SEPARATOR),
    });
  }

  async deleteAllMetadata() {
    return UserMetadataModel.destroy({
      where: {
        userId: this.id,
      },
    });
  }

  async getToolValidations(): Promise<
    { mcpServerId: string; toolNames: string[] }[]
  > {
    const metadata = await UserMetadataModel.findAll({
      where: {
        userId: this.id,
        key: {
          [Op.like]: "toolsValidations:%",
        },
      },
    });

    return metadata.map((m) => {
      const mcpServerId = m.key.replace("toolsValidations:", "");
      const toolNames = m.value
        .split(USER_METADATA_COMMA_SEPARATOR)
        .map((v) => v.replaceAll(USER_METADATA_COMMA_REPLACEMENT, ","))
        .filter((name) => name.length > 0);

      return { mcpServerId, toolNames };
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
      lastLoginAt: this.lastLoginAt?.getTime() ?? null,
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
    const userWhereClause: WhereOptions<UserModel> = {};
    if (options.email) {
      userWhereClause.email = {
        [Op.iLike]: `%${options.email}%`,
      };
    }

    const memberships = await MembershipModel.findAll({
      where: {
        workspaceId: owner.id,
        startAt: { [Op.lte]: new Date() },
        endAt: { [Op.or]: [{ [Op.eq]: null }, { [Op.gte]: new Date() }] },
      },
    });
    userWhereClause.id = {
      [Op.in]: memberships.map((m) => m.userId),
    };

    const { count, rows: users } = await UserModel.findAndCountAll({
      where: userWhereClause,
      order: [[paginationParams.orderColumn, paginationParams.orderDirection]],
      limit: paginationParams.limit,
      offset: paginationParams.offset,
    });

    return {
      users: users.map((u) => new UserResource(UserModel, u.get())),
      total: count,
    };
  }

  toLogJSON(): ResourceLogJSON {
    return {
      sId: this.sId,
    };
  }
}
