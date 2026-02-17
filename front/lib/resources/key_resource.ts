// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.

import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { GroupResource } from "@app/lib/resources/group_resource";
import { KeyModel } from "@app/lib/resources/storage/models/keys";
import { UserModel } from "@app/lib/resources/storage/models/user";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import {
  batchInvalidateCacheWithRedis,
  cacheWithRedis,
  invalidateCacheWithRedis,
} from "@app/lib/utils/cache";
import type { KeyType } from "@app/types/key";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { redactString } from "@app/types/shared/utils/string_utils";
import type { LightWorkspaceType, RoleType } from "@app/types/user";
import { formatUserFullName } from "@app/types/user";
import { hash as blake3 } from "blake3";
import type { Attributes, CreationAttributes, Transaction } from "sequelize";
import { Op } from "sequelize";
import { v4 as uuidv4 } from "uuid";

const KEY_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes.

type CachedKeyData = Omit<
  Attributes<KeyModel>,
  "secret" | "lastUsedAt" | "createdAt" | "updatedAt"
> & {
  lastUsedAt: number | null;
  createdAt: number;
  updatedAt: number;
};

export interface KeyAuthType {
  id: ModelId;
  name: string;
  isSystem: boolean;
  role: RoleType;
  monthlyCapMicroUsd: number | null;
}

export const DEFAULT_SYSTEM_KEY_NAME = "DustSystemKey";
export const SECRET_KEY_PREFIX = "sk-";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface KeyResource extends ReadonlyAttributesType<KeyModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class KeyResource extends BaseResource<KeyModel> {
  static model: ModelStaticWorkspaceAware<KeyModel> = KeyModel;

  private user?: UserModel;

  private static readonly keyCacheKeyResolver = (secret: string) =>
    `key:secret:${Buffer.from(blake3(secret)).toString("hex")}`;

  private static async _fetchBySecretUncached(
    secret: string
  ): Promise<CachedKeyData | null> {
    const key = await KeyResource.model.findOne({
      where: { secret },
      // WORKSPACE_ISOLATION_BYPASS: Used when a request is made from an API Key, at this point we
      // don't know the workspaceId.
      // biome-ignore lint/plugin/noUnverifiedWorkspaceBypass: WORKSPACE_ISOLATION_BYPASS verified
      dangerouslyBypassWorkspaceIsolationSecurity: true,
    });

    if (!key) {
      return null;
    }

    return {
      id: key.id,
      name: key.name,
      status: key.status,
      isSystem: key.isSystem,
      role: key.role,
      scope: key.scope,
      monthlyCapMicroUsd: key.monthlyCapMicroUsd,
      workspaceId: key.workspaceId,
      groupId: key.groupId,
      userId: key.userId,
      lastUsedAt: key.lastUsedAt?.getTime() ?? null,
      createdAt: key.createdAt.getTime(),
      updatedAt: key.updatedAt.getTime(),
    };
  }

  private static fetchBySecretCached = cacheWithRedis(
    KeyResource._fetchBySecretUncached,
    KeyResource.keyCacheKeyResolver,
    { ttlMs: KEY_CACHE_TTL_MS }
  );

  private static invalidateKeyCache = invalidateCacheWithRedis(
    KeyResource._fetchBySecretUncached,
    KeyResource.keyCacheKeyResolver
  );

  private static batchInvalidateKeyCache = batchInvalidateCacheWithRedis(
    KeyResource._fetchBySecretUncached,
    KeyResource.keyCacheKeyResolver
  );

  private static fromCachedData(
    data: CachedKeyData,
    secret: string
  ): KeyResource {
    return new KeyResource(KeyModel, {
      ...data,
      secret,
      lastUsedAt: data.lastUsedAt ? new Date(data.lastUsedAt) : null,
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(data.updatedAt),
    });
  }

  constructor(
    model: ModelStaticWorkspaceAware<KeyModel>,
    blob: Attributes<KeyModel>
  ) {
    super(KeyModel, blob);
  }

  protected override async update(
    blob: Partial<Attributes<KeyModel>>,
    transaction?: Transaction
  ): Promise<[affectedCount: number]> {
    const oldSecret = this.secret;
    const result = await super.update(blob, transaction);
    await KeyResource.invalidateKeyCache(oldSecret);
    return result;
  }

  static async makeNew(
    blob: Omit<CreationAttributes<KeyModel>, "secret" | "groupId" | "scope">,
    group: GroupResource
  ) {
    const secret = this.createNewSecret();
    const key = await KeyResource.model.create({
      ...blob,
      groupId: group.id,
      secret,
      scope: "default",
    });

    return new this(KeyResource.model, key.get());
  }

  static createNewSecret() {
    return `${SECRET_KEY_PREFIX}${Buffer.from(blake3(uuidv4())).toString("hex").slice(0, 32)}`;
  }

  static async fetchSystemKeyForWorkspace(workspace: LightWorkspaceType) {
    const key = await this.model.findOne({
      where: {
        workspaceId: workspace.id,
        isSystem: true,
      },
    });

    if (!key) {
      return null;
    }

    return new this(KeyResource.model, key.get());
  }

  static async fetchBySecret(secret: string) {
    const data = await this.fetchBySecretCached(secret);
    if (data === null) {
      return null;
    }
    return this.fromCachedData(data, secret);
  }

  static async fetchByWorkspaceAndId({
    workspace,
    id,
  }: {
    workspace: LightWorkspaceType;
    id: ModelId | string;
  }) {
    const key = await this.fetchByModelId(id);

    if (!key) {
      return null;
    }

    if (key.workspaceId !== workspace.id) {
      return null;
    }

    return key;
  }

  static async fetchByName(
    auth: Authenticator,
    { name, onlyActive }: { name: string; onlyActive?: boolean }
  ) {
    const key = await this.model.findOne({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        name: name,
        ...(onlyActive ? { status: "active" } : {}),
      },
    });

    if (!key) {
      return null;
    }

    return new this(KeyResource.model, key.get());
  }

  static async listNonSystemKeysByWorkspace(workspace: LightWorkspaceType) {
    const keys = await this.model.findAll({
      where: {
        workspaceId: workspace.id,
        isSystem: false,
      },
      order: [["createdAt", "DESC"]],
      include: [
        {
          as: "user",
          attributes: ["firstName", "lastName"],
          model: UserModel,
          required: false,
        },
      ],
    });

    return keys.map((key) => new this(KeyResource.model, key.get()));
  }

  async markAsUsed() {
    return this.model.update(
      { lastUsedAt: new Date() },
      {
        where: {
          id: this.id,
        },
      }
    );
  }

  async setIsDisabled() {
    return this.update({ status: "disabled" });
  }

  async rotateSecret(
    {
      dangerouslyRotateSecret,
    }: {
      dangerouslyRotateSecret: boolean;
    },
    transaction?: Transaction
  ) {
    if (!dangerouslyRotateSecret) {
      throw new Error("Cannot rotate secret without explicitly allowing it.");
    }

    const newSecret = KeyResource.createNewSecret();
    return this.update({ secret: newSecret }, transaction);
  }

  static async countActiveForGroups(
    auth: Authenticator,
    groups: GroupResource[]
  ) {
    return this.model.count({
      where: {
        groupId: {
          [Op.in]: groups.map((g) => g.id),
        },
        status: "active",
        workspaceId: auth.getNonNullableWorkspace().id,
      },
    });
  }

  // Deletion.

  delete(): Promise<Result<undefined, Error>> {
    throw new Error("Method not implemented.");
  }

  static async deleteAllForWorkspace(auth: Authenticator) {
    const workspaceId = auth.getNonNullableWorkspace().id;

    const keys = await this.model.findAll({
      where: { workspaceId },
      attributes: ["secret"],
    });

    await this.model.destroy({
      where: { workspaceId },
    });

    await KeyResource.batchInvalidateKeyCache(
      keys.map((k) => [k.secret] as [string])
    );
  }

  toJSON(): KeyType {
    // We only display the full secret key for the first 10 minutes after creation.
    const currentTime = new Date();
    const createdAt = new Date(this.createdAt);
    const timeDifference = Math.abs(
      currentTime.getTime() - createdAt.getTime()
    );
    const differenceInMinutes = Math.ceil(timeDifference / (1000 * 60));
    const secret =
      differenceInMinutes > 10 ? redactString(this.secret, 4) : this.secret;

    return {
      id: this.id,
      createdAt: this.createdAt.getTime(),
      lastUsedAt: this.lastUsedAt?.getTime() ?? null,
      creator: this.user ? formatUserFullName(this.user) : null,
      name: this.name,
      secret,
      status: this.status,
      groupId: this.groupId,
      role: this.role,
      scope: this.scope,
      monthlyCapMicroUsd: this.monthlyCapMicroUsd,
    };
  }

  // Use to serialize a KeyResource in the Authenticator.
  toAuthJSON(): KeyAuthType {
    return {
      id: this.id,
      name: this.name,
      isSystem: this.isSystem,
      role: this.role,
      monthlyCapMicroUsd: this.monthlyCapMicroUsd,
    };
  }

  get isActive() {
    return this.status === "active";
  }

  async updateRole({ newRole }: { newRole: RoleType }) {
    await this.update({ role: newRole });
  }

  async updateMonthlyCap({
    monthlyCapMicroUsd,
  }: {
    monthlyCapMicroUsd: number | null;
  }) {
    await this.update({ monthlyCapMicroUsd });
  }
}
