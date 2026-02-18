import type { Authenticator } from "@app/lib/auth";
import type { ResourceLogJSON } from "@app/lib/resources/base_resource";
import { BaseResource } from "@app/lib/resources/base_resource";
import { MembershipModel } from "@app/lib/resources/storage/models/membership";
import {
  UserMetadataModel,
  UserModel,
  UserToolApprovalModel,
} from "@app/lib/resources/storage/models/user";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { searchUsers } from "@app/lib/user_search/search";
import { cacheWithRedis, invalidateCacheWithRedis } from "@app/lib/utils/cache";
import logger from "@app/logger/logger";
import { statsDClient } from "@app/logger/statsDClient";
import { launchIndexUserSearchWorkflow } from "@app/temporal/es_indexation/client";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { md5 } from "@app/types/shared/utils/hashing";
import type {
  LightWorkspaceType,
  UserProviderType,
  UserType,
} from "@app/types/user";
import type { UserSearchDocument } from "@app/types/user_search/user_search";
import { escape } from "html-escaper";
import fromPairs from "lodash/fromPairs";
import sortBy from "lodash/sortBy";
import type {
  Attributes,
  ModelStatic,
  Transaction,
  WhereOptions,
} from "sequelize";
import { Op } from "sequelize";

export interface SearchMembersPaginationParams {
  offset: number;
  limit: number;
}

const USER_METADATA_COMMA_SEPARATOR = ",";
const USER_METADATA_COMMA_REPLACEMENT = "DUST_COMMA";
const TOOLS_VALIDATION_WILDCARD = "*";

const USER_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

type CachedUserData = {
  id: ModelId;
  sId: string;
  provider: UserProviderType;
  providerId: string | null;
  username: string;
  email: string;
  firstName: string;
  lastName: string | null;
  fullName: string;
  image: string | null;
  createdAt: number;
  updatedAt: number;
  isDustSuperUser: boolean;
  workOSUserId: string | null;
  lastLoginAt: number | null;
};

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

  protected async update(
    blob: Partial<Attributes<UserModel>>,
    transaction?: Transaction
  ): Promise<[affectedCount: number]> {
    const result = await super.update(blob, transaction);

    if (this.workOSUserId) {
      await UserResource.invalidateUserByWorkOSIdCache(this.workOSUserId);
    }

    return result;
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

    if (userResource.workOSUserId) {
      await UserResource.invalidateUserByWorkOSIdCache(
        userResource.workOSUserId
      );
    }

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

  static readonly userByWorkOSIdCacheKeyResolver = (
    workOSUserId: string
  ) => `user:workos:${workOSUserId}`;

  private static async _fetchByWorkOSUserIdUncached(
    workOSUserId: string
  ): Promise<CachedUserData | null> {
    const user = await UserModel.findOne({
      where: {
        workOSUserId,
      },
    });
    if (!user) {
      return null;
    }
    return {
      id: user.id,
      sId: user.sId,
      provider: user.provider,
      providerId: user.providerId,
      username: user.username,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: user.name,
      image: user.imageUrl,
      createdAt: user.createdAt.getTime(),
      updatedAt: user.updatedAt.getTime(),
      isDustSuperUser: user.isDustSuperUser,
      workOSUserId: user.workOSUserId,
      lastLoginAt: user.lastLoginAt?.getTime() ?? null,
    };
  }

  private static fetchByWorkOSUserIdCached = cacheWithRedis(
    UserResource._fetchByWorkOSUserIdUncached,
    UserResource.userByWorkOSIdCacheKeyResolver,
    { ttlMs: USER_CACHE_TTL_MS }
  );

  private static invalidateUserByWorkOSIdCache = invalidateCacheWithRedis(
    UserResource._fetchByWorkOSUserIdUncached,
    UserResource.userByWorkOSIdCacheKeyResolver
  );

  private static fromCachedData(data: CachedUserData): UserResource {
    const blob: Attributes<UserModel> = {
      id: data.id,
      sId: data.sId,
      provider: data.provider,
      providerId: data.providerId,
      username: data.username,
      email: data.email,
      name: data.fullName,
      firstName: data.firstName,
      lastName: data.lastName,
      imageUrl: data.image,
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(data.updatedAt),
      isDustSuperUser: data.isDustSuperUser,
      workOSUserId: data.workOSUserId,
      lastLoginAt: data.lastLoginAt ? new Date(data.lastLoginAt) : null,
    };
    return new UserResource(UserModel, blob);
  }

  static async fetchByWorkOSUserId(
    workOSUserId: string,
    transaction?: Transaction
  ): Promise<UserResource | null> {
    // Bypass cache when transaction is provided for transactional consistency
    if (transaction) {
      const user = await UserModel.findOne({
        where: {
          workOSUserId,
        },
        transaction,
      });
      return user ? new UserResource(UserModel, user.get()) : null;
    }

    const cached = await this.fetchByWorkOSUserIdCached(workOSUserId);
    if (!cached) {
      return null;
    }

    return this.fromCachedData(cached);
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
    const oldWorkOSUserId = this.workOSUserId;

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

    if (oldWorkOSUserId && oldWorkOSUserId !== workOSUserId) {
      await UserResource.invalidateUserByWorkOSIdCache(oldWorkOSUserId);
    }

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

  async setWorkOSUserId(workOSUserId: string | null) {
    const oldWorkOSUserId = this.workOSUserId;

    const result = await this.update({
      workOSUserId,
    });

    if (oldWorkOSUserId && oldWorkOSUserId !== workOSUserId) {
      await UserResource.invalidateUserByWorkOSIdCache(oldWorkOSUserId);
    }

    return result;
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<undefined, Error>> {
    await this.deleteAllMetadata(auth);

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

  async setMetadata(
    key: string,
    value: string,
    workspaceModelId?: number | null
  ) {
    const metadata = await UserMetadataModel.findOne({
      where: {
        userId: this.id,
        key,
        workspaceId: workspaceModelId ?? null,
      },
    });

    if (!metadata) {
      await UserMetadataModel.create({
        userId: this.id,
        key,
        value,
        workspaceId: workspaceModelId ?? null,
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

  async deleteAllMetadata(auth: Authenticator) {
    await UserMetadataModel.destroy({
      where: {
        userId: this.id,
      },
    });

    await UserToolApprovalModel.destroy({
      where: {
        userId: this.id,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
    });

    return;
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

  /**
   * Create a tool approval for this user.
   *
   * For low stake (tool-level): omit agentId and argsAndValues (both default to null)
   * For medium stake (per-agent, per-args): pass agentId and argsAndValues
   */
  async createToolApproval(
    auth: Authenticator,
    {
      mcpServerId,
      toolName,
      agentId = null,
      argsAndValues = null,
    }: {
      mcpServerId: string;
      toolName: string;
      agentId?: string | null;
      argsAndValues?: Record<string, string> | null;
    }
  ): Promise<void> {
    // Sort keys to ensure consistent JSONB storage for unique constraint.
    const sortedArgsAndValues = argsAndValues
      ? fromPairs(sortBy(Object.entries(argsAndValues), ([key]) => key))
      : null;

    const argsAndValuesMd5 = md5(JSON.stringify(sortedArgsAndValues));

    const findClause = {
      workspaceId: auth.getNonNullableWorkspace().id,
      userId: this.id,
      mcpServerId,
      toolName,
      agentId: agentId ?? { [Op.is]: null },
      argsAndValuesMd5: argsAndValues ? argsAndValuesMd5 : { [Op.is]: null },
    };

    await UserToolApprovalModel.findOrCreate({
      where: findClause,
      defaults: {
        ...findClause,
        agentId,
        argsAndValues: sortedArgsAndValues,
        argsAndValuesMd5: argsAndValues ? argsAndValuesMd5 : null,
      },
    });
  }

  async hasApprovedTool(
    auth: Authenticator,
    {
      mcpServerId,
      toolName,
      agentId = null,
      argsAndValues = null,
    }: {
      mcpServerId: string;
      toolName: string;
      agentId?: string | null;
      argsAndValues?: Record<string, string> | null;
    }
  ): Promise<boolean> {
    const sortedArgsAndValues = argsAndValues
      ? fromPairs(sortBy(Object.entries(argsAndValues), ([key]) => key))
      : null;

    // For low-stake tools (agentId=null, argsAndValues=null), also check for
    // wildcard "*" approval which approves all tools for the server.
    const isLowStake = agentId === null && argsAndValues === null;

    const approval = await UserToolApprovalModel.findOne({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        userId: this.id,
        mcpServerId,
        toolName: isLowStake
          ? { [Op.in]: [toolName, TOOLS_VALIDATION_WILDCARD] }
          : toolName,
        agentId: agentId ?? { [Op.is]: null },
        argsAndValuesMd5: argsAndValues
          ? md5(JSON.stringify(sortedArgsAndValues))
          : { [Op.is]: null },
      },
    });

    return approval !== null;
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
