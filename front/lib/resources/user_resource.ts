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
import { searchUsers } from "@app/lib/user_search/search";
import logger from "@app/logger/logger";
import { statsDClient } from "@app/logger/statsDClient";
import { launchIndexUserSearchWorkflow } from "@app/temporal/es_indexation/client";
import type { LightWorkspaceType, ModelId, Result, UserType } from "@app/types";
import { Err, normalizeError, Ok } from "@app/types";
import type { UserSearchDocument } from "@app/types/user_search/user_search";

export interface SearchMembersPaginationParams {
  offset: number;
  limit: number;
}

const USER_METADATA_COMMA_SEPARATOR = ",";
const USER_METADATA_COMMA_REPLACEMENT = "DUST_COMMA";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
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
    const userResource = new this(UserModel, user.get());

    // Update user search index across all workspaces.
    const workflowResult = await launchIndexUserSearchWorkflow({
      userId: userResource.sId,
    });
    if (workflowResult.isErr()) {
      // Throw if it fails to launch (unexpected).
      throw workflowResult.error;
    }

    return userResource;
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

  static async searchUsers(
    auth: Authenticator,
    {
      searchTerm,
      offset,
      limit,
    }: {
      searchTerm: string;
      offset: number;
      limit: number;
    }
  ): Promise<Result<{ users: UserResource[]; total: number }, Error>> {
    const owner = auth.getNonNullableWorkspace();

    // Search users in Elasticsearch
    const searchResult = await searchUsers({
      owner,
      searchTerm,
      offset,
      limit,
    });
    if (searchResult.isErr()) {
      return searchResult;
    }

    const { users: userDocs, total } = searchResult.value;
    const userIds = userDocs.map((doc) => doc.user_id);

    if (userIds.length === 0) {
      return new Ok({ users: [], total: 0 });
    }

    // Note that UserResource has stored sIds, not generated ones.
    const users = await UserModel.findAll({
      where: {
        sId: { [Op.in]: userIds },
      },
      include: [
        {
          model: MembershipModel,
          as: "memberships",
          required: true, // INNER JOIN
          where: {
            workspaceId: owner.id,
            startAt: { [Op.lte]: new Date() },
            endAt: { [Op.or]: [{ [Op.eq]: null }, { [Op.gte]: new Date() }] },
          },
        },
      ],
    });

    // Check if we found fewer users than expected (means some were revoked)
    if (users.length < userIds.length) {
      const foundUserIds = new Set(users.map((u) => u.sId));
      const missingUserIds = userIds.filter((sId) => !foundUserIds.has(sId));

      statsDClient.increment("user_search.revoked_users_in_results.count", 1);

      logger.error(
        {
          workspaceId: owner.sId,
          missingUserSIds: missingUserIds,
          owner: "spolu",
        },
        // This log is expected as user search queries may happen before the index update completes
        // (temporal workflow + ES indexing asynchronously). We keep it to ensure that volume stays
        // flat. An increase would indicate a synchronization problem.
        "[user_search] Found revoked users in search results"
      );
    }

    // Create a map to maintain the order from Elasticsearch results
    const userResourceMap = new Map<string, UserResource>();
    users.forEach((u) => {
      const userBlob = u.get();
      userResourceMap.set(u.sId, new UserResource(UserModel, userBlob));
    });

    // Return users in the order from Elasticsearch results
    const orderedUsers = userIds
      .map((sId) => userResourceMap.get(sId))
      .filter((user): user is UserResource => user !== undefined);

    return new Ok({ users: orderedUsers, total });
  }

  async updateName(firstName: string, lastName: string | null) {
    firstName = escape(firstName);
    if (lastName) {
      lastName = escape(lastName);
    }
    const result = await this.update({
      firstName,
      lastName,
    });

    // Update user search index across all workspaces.
    const workflowResult = await launchIndexUserSearchWorkflow({
      userId: this.sId,
    });
    if (workflowResult.isErr()) {
      // Throw if it fails to launch (unexpected).
      throw workflowResult.error;
    }

    return result;
  }

  async updateImage(imageUrl: string | null) {
    return this.update({
      imageUrl,
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
    const result = await this.update({
      username,
      firstName,
      lastName,
      email: lowerCaseEmail,
      workOSUserId,
    });

    // Update user search index across all workspaces.
    const workflowResult = await launchIndexUserSearchWorkflow({
      userId: this.sId,
    });
    if (workflowResult.isErr()) {
      // Throw if it fails to launch (unexpected).
      throw workflowResult.error;
    }

    return result;
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

  async getMetadata(key: string, workspaceModelId?: number | null) {
    return UserMetadataModel.findOne({
      where: {
        userId: this.id,
        key,
        workspaceId: workspaceModelId ?? null,
      },
    });
  }

  async setMetadata(key: string, value: string, workspaceId?: number | null) {
    const metadata = await UserMetadataModel.findOne({
      where: {
        userId: this.id,
        key,
        workspaceId: workspaceId ?? null,
      },
    });

    if (!metadata) {
      await UserMetadataModel.create({
        userId: this.id,
        key,
        value,
        workspaceId: workspaceId ?? null,
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

  toUserSearchDocument(workspace: LightWorkspaceType): UserSearchDocument {
    return {
      workspace_id: workspace.sId,
      user_id: this.sId,
      email: this.email,
      full_name: this.fullName(),
      updated_at: this.updatedAt,
    };
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

  toLogJSON(): ResourceLogJSON {
    return {
      sId: this.sId,
    };
  }
}
