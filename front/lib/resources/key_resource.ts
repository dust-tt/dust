// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.

import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { KeyModel } from "@app/lib/resources/storage/models/keys";
import { UserModel } from "@app/lib/resources/storage/models/user";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import {
  batchInvalidateCacheWithRedis,
  cacheWithRedis,
  invalidateCacheAfterCommit,
  invalidateCacheWithRedis,
} from "@app/lib/utils/cache";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import type { ApiKeyCreditState, KeyType } from "@app/types/key";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { redactString } from "@app/types/shared/utils/string_utils";
import type { SpaceType } from "@app/types/space";
import type {
  AssignableRoleType,
  LightWorkspaceType,
  RoleType,
} from "@app/types/user";
import { formatUserFullName } from "@app/types/user";
import { blake3 } from "@napi-rs/blake-hash";
import assert from "assert";
import type { Attributes, CreationAttributes, Transaction } from "sequelize";
import { Op } from "sequelize";
import { v4 as uuidv4 } from "uuid";

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
  userModelId: ModelId | null;
  name: string;
  isSystem: boolean;
  role: RoleType;
  monthlyCapMicroUsd: number | null;
}

// A key proven to be a system key. Callers that only make sense for a system key take this rather
// than a key plus a boolean, so a regular key cannot reach them (see `Authenticator.resolvePermissions`).
export type SystemKey = { isSystem: true };

export function isSystemKey<T extends { isSystem: boolean }>(
  key: T
): key is T & SystemKey {
  return key.isSystem;
}

export const DEFAULT_SYSTEM_KEY_NAME = "DustSystemKey";
export const SECRET_KEY_PREFIX = "sk-";

// "Last used" is only shown coarsely in the UI; skip DB writes within this window
// to avoid row-lock contention on hot API keys.
export const MARK_AS_USED_MIN_INTERVAL_MS = 60 * 60 * 1000;

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface KeyResource extends ReadonlyAttributesType<KeyModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class KeyResource extends BaseResource<KeyModel> {
  static model: ModelStaticWorkspaceAware<KeyModel> = KeyModel;

  private user?: UserModel;

  static readonly keyCacheKeyResolver = (secret: string) =>
    `key:secret:${blake3(secret).toString("hex")}`;

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
      monthlyCapMicroUsd: key.monthlyCapMicroUsd,
      monthlyCapAwuCredits: key.monthlyCapAwuCredits,
      creditState: key.creditState,
      workspaceId: key.workspaceId,
      groupIds: key.groupIds,
      userId: key.userId,
      lastUsedAt: key.lastUsedAt?.getTime() ?? null,
      createdAt: key.createdAt.getTime(),
      updatedAt: key.updatedAt.getTime(),
    };
  }

  // Cache eviction is handled by Redis's allkeys-lfu eviction policy.
  private static fetchBySecretCached = cacheWithRedis(
    KeyResource._fetchBySecretUncached,
    KeyResource.keyCacheKeyResolver,
    {}
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
    invalidateCacheAfterCommit(transaction, () =>
      KeyResource.invalidateKeyCache(oldSecret)
    );
    return result;
  }

  static async makeNew(
    blob: Omit<CreationAttributes<KeyModel>, "secret" | "groupIds">,
    groups: GroupResource[]
  ) {
    const secret = this.createNewSecret();
    const key = await KeyResource.model.create({
      ...blob,
      groupIds: groups.map((g) => g.id),
      secret,
    });

    return new this(KeyResource.model, key.get());
  }

  static createNewSecret() {
    return `${SECRET_KEY_PREFIX}${blake3(uuidv4()).toString("hex").slice(0, 32)}`;
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
    const parsedId = typeof id === "string" ? parseInt(id, 10) : id;
    const key = await this.model.findOne({
      where: {
        id: parsedId,
        workspaceId: workspace.id,
      },
    });

    if (!key) {
      return null;
    }

    return new this(KeyResource.model, key.get());
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

  // All active keys with a given name. Names are not unique, and Metronome
  // aggregates spend per name, so the per-key credit cap is effectively
  // per-name: the cap webhook transitions every active key sharing the name.
  static async listActiveByWorkspaceAndName(
    workspace: LightWorkspaceType,
    name: string
  ) {
    const keys = await this.model.findAll({
      where: {
        workspaceId: workspace.id,
        name,
        status: "active",
      },
    });

    return keys.map((key) => new this(KeyResource.model, key.get()));
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
    if (
      this.lastUsedAt &&
      Date.now() - this.lastUsedAt.getTime() < MARK_AS_USED_MIN_INTERVAL_MS
    ) {
      return;
    }

    // Use `this.update` (not `model.update`) so the instance and Redis secret
    // cache stay consistent — otherwise every cached hit would keep writing.
    return this.update({ lastUsedAt: new Date() });
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
        groupIds: {
          [Op.overlap]: groups.map((g) => g.id),
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

  private toJSON(
    requestingUserModelId: ModelId,
    spaces: SpaceType[],
    // The flag-aware per-key "capped" verdict, resolved by the caller (the
    // rate-limiter reader lives in `lib/api/keys/spend_limit` to avoid a
    // resource → `lib/auth` import cycle). Defaults to the persisted Metronome
    // credit state — the flag-off behavior — when the caller doesn't provide it.
    isSpendCapped: boolean = this.creditState === "capped"
  ): KeyType {
    // We only display the full secret key to the admin who created it, and only
    // for the first 10 minutes after creation. Every other admin (or the
    // creator past the window) sees a redacted value.
    const currentTime = new Date();
    const createdAt = new Date(this.createdAt);
    const timeDifference = Math.abs(
      currentTime.getTime() - createdAt.getTime()
    );
    const differenceInMinutes = Math.ceil(timeDifference / (1000 * 60));
    const isCreator = this.userId === requestingUserModelId;
    const secret =
      isCreator && differenceInMinutes <= 10
        ? this.secret
        : redactString(this.secret, 4);

    return {
      id: this.id,
      createdAt: this.createdAt.getTime(),
      lastUsedAt: this.lastUsedAt?.getTime() ?? null,
      creator: this.user ? formatUserFullName(this.user) : null,
      name: this.name,
      secret,
      status: this.status,
      spaces,
      role: this.role,
      monthlyCapMicroUsd: this.monthlyCapMicroUsd,
      monthlyCapAwuCredits: this.monthlyCapAwuCredits,
      creditState: this.creditState,
      isSpendCapped,
    };
  }

  /**
   * The spaces each of `keys` can reach, keyed by key model id.
   *
   * A key stores the groups it was scoped to, never spaces, so the spaces are reverse-mapped from
   * those groups through their `space` grants in `group_permissions`. The workspace global group is
   * ignored: every key carries it and it holds `reader` on every open space, so mapping it would
   * list most of the workspace on every row.
   *
   * Display-only: it never feeds back into authorization.
   */
  private static async listSpacesByKeyModelId(
    auth: Authenticator,
    keys: KeyResource[]
  ): Promise<Map<ModelId, SpaceType[]>> {
    if (keys.length === 0) {
      return new Map();
    }

    const globalGroupRes = await GroupResource.fetchWorkspaceGlobalGroup(auth);
    const globalGroupModelId = globalGroupRes.isOk()
      ? globalGroupRes.value.id
      : null;

    const groupModelIds = [
      ...new Set(keys.flatMap((key) => key.groupIds)),
    ].filter((groupModelId) => groupModelId !== globalGroupModelId);
    if (groupModelIds.length === 0) {
      return new Map();
    }

    const grants = await GroupPermissionResource.listForGroups(
      auth.getNonNullableWorkspace(),
      { groupModelIds, resourceType: "space" }
    );

    const spaces = await SpaceResource.fetchByModelIds(auth, [
      ...new Set(grants.map((grant) => grant.resourceId)),
    ]);
    const spaceByModelId = new Map(
      spaces.map((space) => [space.id, space.toJSON()])
    );

    const spacesByGroupModelId = new Map<ModelId, SpaceType[]>();
    for (const grant of grants) {
      // A grant on a space we could not resolve (deleted, say) has nothing to display.
      const space = spaceByModelId.get(grant.resourceId);
      if (!space) {
        continue;
      }

      const existing = spacesByGroupModelId.get(grant.groupId);
      if (existing) {
        existing.push(space);
      } else {
        spacesByGroupModelId.set(grant.groupId, [space]);
      }
    }

    return new Map(
      keys.map((key) => {
        const spaces = new Map(
          key.groupIds
            .flatMap(
              (groupModelId) => spacesByGroupModelId.get(groupModelId) ?? []
            )
            .map((space) => [space.sId, space])
        );

        return [
          key.id,
          [...spaces.values()].sort((a, b) => a.name.localeCompare(b.name)),
        ];
      })
    );
  }

  static async toJSONWithSpaces(
    auth: Authenticator,
    keys: KeyResource[],
    requestingUserModelId: ModelId,
    // Flag-aware per-key "capped" verdict, keyed by key model id, computed by the
    // caller via `getApiKeysSpendCappedByModelId` (the rate-limiter reader lives
    // in `lib/api/keys/spend_limit` to avoid a resource → `lib/auth` cycle). When
    // omitted, `toJSON` falls back to the persisted credit state (flag-off
    // behavior) — used by the single-key mutation responses whose value the
    // client re-fetches from the flag-aware list anyway.
    spendCappedByModelId?: ReadonlyMap<ModelId, boolean>
  ): Promise<KeyType[]> {
    const spacesByKeyModelId = await this.listSpacesByKeyModelId(auth, keys);

    return keys.map((key) =>
      key.toJSON(
        requestingUserModelId,
        spacesByKeyModelId.get(key.id) ?? [],
        spendCappedByModelId?.get(key.id) ?? key.creditState === "capped"
      )
    );
  }

  async toJSONWithSpaces(
    auth: Authenticator,
    requestingUserModelId: ModelId,
    spendCappedByModelId?: ReadonlyMap<ModelId, boolean>
  ): Promise<KeyType> {
    const [json] = await KeyResource.toJSONWithSpaces(
      auth,
      [this],
      requestingUserModelId,
      spendCappedByModelId
    );

    return json;
  }

  // Use to serialize a KeyResource in the Authenticator.
  toAuthJSON(): KeyAuthType {
    return {
      id: this.id,
      userModelId: this.userId ?? null,
      name: this.name,
      isSystem: this.isSystem,
      role: this.role,
      monthlyCapMicroUsd: this.monthlyCapMicroUsd,
    };
  }

  get isActive() {
    return this.status === "active";
  }

  async updateRole({ newRole }: { newRole: AssignableRoleType }) {
    await this.update({ role: newRole });
  }

  // Adds or removes a single group from groupIds. Idempotent.
  async setGroupMembership({
    group,
    isMember,
  }: {
    group: GroupResource;
    isMember: boolean;
  }): Promise<void> {
    const hasGroup = this.groupIds.includes(group.id);
    if (isMember === hasGroup) {
      return;
    }

    const groupIds = isMember
      ? [...this.groupIds, group.id]
      : this.groupIds.filter((id) => id !== group.id);
    await this.update({ groupIds });
  }

  private async fetchWorkspace(): Promise<LightWorkspaceType> {
    const [workspace] = await WorkspaceResource.fetchByModelIds([
      this.workspaceId,
    ]);
    assert(workspace, `Workspace not found for key ${this.id}`);
    return renderLightWorkspaceType({ workspace });
  }

  async updateMonthlyCap({
    monthlyCapMicroUsd,
  }: {
    monthlyCapMicroUsd: number | null;
  }) {
    await this.update({ monthlyCapMicroUsd });
  }

  async updateMonthlyCapAwuCredits(
    monthlyCapAwuCredits: number | null,
    transaction?: Transaction
  ) {
    await this.update({ monthlyCapAwuCredits }, transaction);
  }

  async updateCreditState(
    creditState: ApiKeyCreditState,
    transaction?: Transaction
  ) {
    await this.update({ creditState }, transaction);
  }
}
