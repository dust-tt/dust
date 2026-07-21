import type { RedisClientType } from "@app/lib/api/redis";
import { getRedisCacheClient } from "@app/lib/api/redis";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { GroupResource } from "@app/lib/resources/group_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { GroupSpaceModel } from "@app/lib/resources/storage/models/group_spaces";
import { GroupModel } from "@app/lib/resources/storage/models/groups";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { invalidateCacheAfterCommit } from "@app/lib/utils/cache";
import { getStatsDClient } from "@app/lib/utils/statsd";
import logger from "@app/logger/logger";
import type { GroupKind } from "@app/types/groups";
import { GROUP_KINDS } from "@app/types/groups";
import type { CombinedResourcePermissions } from "@app/types/resource_permissions";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { GroupSpaceKind } from "@app/types/space";
import { GROUP_SPACE_KINDS } from "@app/types/space";
import type { UserType } from "@app/types/user";
import type {
  Attributes,
  FindOptions,
  InferAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";
import { Op } from "sequelize";
import { z } from "zod";

// Base class for group-space junction resources
// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface GroupSpaceBaseResource
  extends ReadonlyAttributesType<GroupSpaceModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export abstract class GroupSpaceBaseResource extends BaseResource<GroupSpaceModel> {
  static model: ModelStatic<GroupSpaceModel> = GroupSpaceModel;

  static async destroyAllForGroup(
    auth: Authenticator,
    {
      groupModelId,
      transaction,
    }: { groupModelId: ModelId; transaction?: Transaction }
  ): Promise<void> {
    await GroupSpaceModel.destroy({
      where: {
        groupId: groupModelId,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      transaction,
    });
  }

  constructor(
    model: ModelStatic<GroupSpaceModel>,
    blob: Attributes<GroupSpaceModel>,
    readonly space: SpaceResource,
    readonly group: GroupResource
  ) {
    super(GroupSpaceModel, blob);
  }

  abstract requestedPermissions(): Promise<CombinedResourcePermissions[]>;
  abstract canAddMember(auth: Authenticator, userId: string): Promise<boolean>;
  abstract canRemoveMember(
    auth: Authenticator,
    userId: string,
    /** If true, removing the last member of the group is allowed (useful when we add and remove member at the same time) */
    skipCheckLastMember?: boolean
  ): Promise<boolean>;

  /**
   * Add multiple members to the group with permissions from this group-space relationship.
   */
  async addMembers(
    auth: Authenticator,
    {
      users,
      transaction,
    }: {
      users: UserType[];
      transaction?: Transaction;
    }
  ): Promise<
    Result<
      undefined,
      DustError<
        | "unauthorized"
        | "user_not_found"
        | "user_already_member"
        | "group_requirements_not_met"
        | "system_or_global_group"
      >
    >
  > {
    const canAddResults = await concurrentExecutor(
      users,
      async (user) => this.canAddMember(auth, user.sId),
      { concurrency: 8 }
    );
    if (!canAddResults.every((result) => result)) {
      return new Err(
        new DustError(
          "unauthorized",
          "You're not authorized to add group members"
        )
      );
    }
    const addMembersRes = await this.group.dangerouslyAddMembers(auth, {
      users,
      transaction,
    });
    if (addMembersRes.isErr()) {
      return new Err(addMembersRes.error);
    }
    return new Ok(addMembersRes.value);
  }

  /**
   * Remove multiple members from the group with permissions from this group-space relationship.
   */
  async removeMembers(
    auth: Authenticator,
    {
      users,
      transaction,
    }: {
      users: UserType[];
      transaction?: Transaction;
    }
  ): Promise<
    Result<
      undefined,
      DustError<
        | "unauthorized"
        | "user_not_found"
        | "user_not_member"
        | "system_or_global_group"
      >
    >
  > {
    const canRemoveResults = await concurrentExecutor(
      users,
      async (user) => this.canRemoveMember(auth, user.sId),
      { concurrency: 8 }
    );
    if (!canRemoveResults.every((result) => result)) {
      return new Err(
        new DustError(
          "unauthorized",
          "You're not authorized to remove group members"
        )
      );
    }
    const removeMembersRes = await this.group.dangerouslyRemoveMembers(auth, {
      users,
      transaction,
    });
    if (removeMembersRes.isErr()) {
      return new Err(removeMembersRes.error);
    }
    return new Ok(removeMembersRes.value);
  }

  /**
   * Set the exact list of members for the group with permissions from this group-space relationship.
   * This will add new members and remove members not in the list.
   */
  async setMembers(
    auth: Authenticator,
    {
      users,
      transaction,
    }: {
      users: UserType[];
      transaction?: Transaction;
    }
  ): Promise<
    Result<
      undefined,
      DustError<
        | "unauthorized"
        | "user_not_found"
        | "user_not_member"
        | "user_already_member"
        | "group_requirements_not_met"
        | "system_or_global_group"
      >
    >
  > {
    const currentMembers = await this.group.getAllMembers(auth);
    const membersToAdd = users.filter(
      (user) => !currentMembers.some((member) => member.sId === user.sId)
    );
    const membersToRemove = currentMembers.filter(
      (member) => !users.some((user) => user.sId === member.sId)
    );
    const canAddResults = await concurrentExecutor(
      membersToAdd,
      async (user) => this.canAddMember(auth, user.sId),
      { concurrency: 8 }
    );
    const canRemoveResults = await concurrentExecutor(
      membersToRemove,
      async (user) =>
        this.canRemoveMember(auth, user.sId, !!membersToAdd.length),
      { concurrency: 8 }
    );
    if (
      !canAddResults.every((result) => result) ||
      !canRemoveResults.every((result) => result)
    ) {
      return new Err(
        new DustError(
          "unauthorized",
          "You're not authorized to change group members"
        )
      );
    }
    const setMembersRes = await this.group.dangerouslySetMembers(auth, {
      users,
      transaction,
    });
    if (setMembersRes.isErr()) {
      return new Err(setMembersRes.error);
    }
    return new Ok(setMembersRes.value);
  }

  /**
   * Delete the group-space relationship.
   */
  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<undefined, Error>> {
    try {
      await GroupSpaceModel.destroy({
        where: {
          groupId: this.groupId,
          vaultId: this.vaultId,
          workspaceId: auth.getNonNullableWorkspace().id,
          kind: this.kind,
        },
        transaction,
      });

      await GroupModel.destroy({
        where: {
          id: this.groupId,
          workspaceId: auth.getNonNullableWorkspace().id,
          // Delete the corresponding group if it's regular_auto or space_editors (system, global, provisioned groups should not be deleted)
          kind: ["regular_auto", "space_editors"],
        },
        transaction,
      });

      return new Ok(undefined);
    } catch (error) {
      return new Err(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

// group_vaults cache, write side. Data is a redis HASH at the workspace's current
// version, one field per vaultId, so readers can HMGET just the vaults they need.
// This ships write-only (populated from baseFetch, nothing reads it yet) so cache
// behavior is observable in production before reads or invalidation depend on it.

// Bump to orphan every hash written under the previous schema. 2: hashes written
// before invalidation shipped may be stale.
const GROUP_SPACES_CACHE_SCHEMA = 2;

export function groupSpacesCacheVersionKey(workspaceId: number): string {
  return `group_vaults:${GROUP_SPACES_CACHE_SCHEMA}:ws:${workspaceId}:v`;
}

export function groupSpacesCacheDataKey(
  workspaceId: number,
  version: number
): string {
  return `group_vaults:${GROUP_SPACES_CACHE_SCHEMA}:ws:${workspaceId}:${version}`;
}

// Field proving the hash was fully populated: a missing vaultId field then means "no
// groups", not "never written".
const POPULATED_FIELD = "_";

const cachedVaultRowsSchema = z.array(
  z.object({
    groupSpace: z.object({
      id: z.number(),
      kind: z.enum(GROUP_SPACE_KINDS),
      vaultId: z.number(),
      groupId: z.number(),
      workspaceId: z.number(),
      createdAtMs: z.number(),
      updatedAtMs: z.number(),
    }),
    group: z.object({
      id: z.number(),
      name: z.string(),
      kind: z.enum(GROUP_KINDS),
      workOSGroupId: z.string().nullable(),
      poolCapAwuCredits: z.number().nullable(),
      workspaceId: z.number(),
      createdAtMs: z.number(),
      updatedAtMs: z.number(),
    }),
  })
);

type CachedVaultRows = z.infer<typeof cachedVaultRowsSchema>;

export type GroupSpaceWithGroup = {
  groupSpace: {
    id: number;
    kind: GroupSpaceKind;
    vaultId: number;
    groupId: number;
    workspaceId: number;
    createdAt: Date;
    updatedAt: Date;
  };
  group: {
    id: number;
    name: string;
    kind: GroupKind;
    workOSGroupId: string | null;
    poolCapAwuCredits: number | null;
    workspaceId: number;
    createdAt: Date;
    updatedAt: Date;
  };
};

function serializeVaultRows(rows: GroupSpaceWithGroup[]): CachedVaultRows {
  return rows.map(({ groupSpace, group }) => ({
    groupSpace: {
      id: groupSpace.id,
      kind: groupSpace.kind,
      vaultId: groupSpace.vaultId,
      groupId: groupSpace.groupId,
      workspaceId: groupSpace.workspaceId,
      createdAtMs: groupSpace.createdAt.getTime(),
      updatedAtMs: groupSpace.updatedAt.getTime(),
    },
    group: {
      id: group.id,
      name: group.name,
      kind: group.kind,
      workOSGroupId: group.workOSGroupId,
      poolCapAwuCredits: group.poolCapAwuCredits,
      workspaceId: group.workspaceId,
      createdAtMs: group.createdAt.getTime(),
      updatedAtMs: group.updatedAt.getTime(),
    },
  }));
}

async function fetchWorkspaceGroupSpacesFromDb(
  workspaceId: number
): Promise<Map<ModelId, GroupSpaceWithGroup[]>> {
  const byVault = new Map<ModelId, GroupSpaceWithGroup[]>();
  const groupSpaces = await GroupSpaceModel.findAll({ where: { workspaceId } });
  if (groupSpaces.length === 0) {
    return byVault;
  }
  const groups = await GroupModel.findAll({
    where: {
      workspaceId,
      id: [...new Set(groupSpaces.map((gs) => gs.groupId))],
    },
  });
  const groupById = new Map(groups.map((g) => [g.id, g]));

  for (const gs of groupSpaces) {
    const group = groupById.get(gs.groupId);
    if (!group) {
      continue;
    }
    const rows = byVault.get(gs.vaultId) ?? [];
    rows.push({
      groupSpace: {
        id: gs.id,
        kind: gs.kind,
        vaultId: gs.vaultId,
        groupId: gs.groupId,
        workspaceId: gs.workspaceId,
        createdAt: gs.createdAt,
        updatedAt: gs.updatedAt,
      },
      group: {
        id: group.id,
        name: group.name,
        kind: group.kind,
        workOSGroupId: group.workOSGroupId,
        poolCapAwuCredits: group.poolCapAwuCredits,
        workspaceId: group.workspaceId,
        createdAt: group.createdAt,
        updatedAt: group.updatedAt,
      },
    });
    byVault.set(gs.vaultId, rows);
  }
  return byVault;
}

// group_vaults cache invalidation.

// INCR (not DEL): a DEL racing a concurrent miss-populate would let stale data be
// written back forever. Bumping the version strands in-flight populates on a dead key.
export async function invalidateGroupSpacesCache(
  workspaceIds: number[],
  source: string
): Promise<void> {
  if (workspaceIds.length === 0) {
    return;
  }
  try {
    const redisCli = await getRedisCacheClient({ origin: "cache_with_redis" });
    for (const workspaceId of workspaceIds) {
      await redisCli.incr(groupSpacesCacheVersionKey(workspaceId));
    }
    getStatsDClient().increment(
      "group_spaces_cache.invalidate",
      workspaceIds.length,
      [`source:${source}`]
    );
  } catch (err) {
    // A failed bump means potentially stale permission data: page on this.
    logger.error(
      { panic: true, err: normalizeError(err), workspaceIds, source },
      "group_vaults cache invalidation failed"
    );
  }
}

function scheduleInvalidation(
  workspaceIds: number[],
  transaction: Transaction | null | undefined,
  source: string
): void {
  const uniqueIds = [...new Set(workspaceIds)];
  invalidateCacheAfterCommit(transaction ?? undefined, () =>
    invalidateGroupSpacesCache(uniqueIds, source)
  );
}

function numericIds(value: unknown): number[] | null {
  if (typeof value === "number") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.length > 0 &&
      value.every((v): v is number => typeof v === "number")
      ? value
      : null;
  }
  if (value && typeof value === "object") {
    const inValue: unknown = Reflect.get(value, Op.in);
    if (inValue !== undefined) {
      return numericIds(inValue);
    }
  }
  return null;
}

function workspaceIdsFromWhere(where: unknown): number[] {
  if (where && typeof where === "object" && "workspaceId" in where) {
    const ids = numericIds(where.workspaceId);
    if (ids) {
      return ids;
    }
  }
  // Fail closed: no invalidation, no write.
  throw new Error(
    "group_vaults write refused: cannot derive workspaceId for cache invalidation."
  );
}

// Raw SQL bypasses these hooks: migrations must invalidate explicitly.
GroupSpaceModel.addHook("afterCreate", "group_vaults_cache", (gs, options) => {
  if (gs instanceof GroupSpaceModel) {
    scheduleInvalidation([gs.workspaceId], options.transaction, "create");
  }
});
GroupSpaceModel.addHook(
  "afterBulkCreate",
  "group_vaults_cache",
  (instances, options) => {
    const workspaceIds = instances
      .filter((gs): gs is GroupSpaceModel => gs instanceof GroupSpaceModel)
      .map((gs) => gs.workspaceId);
    scheduleInvalidation(workspaceIds, options.transaction, "bulk_create");
  }
);
GroupSpaceModel.addHook("afterUpdate", "group_vaults_cache", (gs, options) => {
  if (gs instanceof GroupSpaceModel) {
    scheduleInvalidation([gs.workspaceId], options.transaction, "update");
  }
});
GroupSpaceModel.addHook("afterDestroy", "group_vaults_cache", (gs, options) => {
  if (gs instanceof GroupSpaceModel) {
    scheduleInvalidation([gs.workspaceId], options.transaction, "destroy");
  }
});
GroupSpaceModel.addHook("afterBulkUpdate", "group_vaults_cache", (options) => {
  scheduleInvalidation(
    workspaceIdsFromWhere(options.where),
    options.transaction,
    "bulk_update"
  );
});
GroupSpaceModel.addHook("afterBulkDestroy", "group_vaults_cache", (options) => {
  scheduleInvalidation(
    workspaceIdsFromWhere(options.where),
    options.transaction,
    "bulk_destroy"
  );
});

// Group name/poolCapAwuCredits are cached with the associations; group updates bump
// the version too (kind and id are immutable).
GroupModel.addHook("afterUpdate", "group_vaults_cache", (group, options) => {
  if (group instanceof GroupModel) {
    scheduleInvalidation(
      [group.workspaceId],
      options.transaction,
      "group_update"
    );
  }
});
GroupModel.addHook("afterBulkUpdate", "group_vaults_cache", async (options) => {
  const where: unknown = options.where;
  if (where && typeof where === "object" && "workspaceId" in where) {
    const ids = numericIds(where.workspaceId);
    if (ids) {
      scheduleInvalidation(ids, options.transaction, "group_bulk_update");
      return;
    }
  }
  // BaseResource.update goes through here with a bare { id } where clause.
  const groupIds =
    where && typeof where === "object" && "id" in where
      ? numericIds(where.id)
      : null;
  if (groupIds) {
    const findOptions: FindOptions<InferAttributes<GroupModel>> & {
      dangerouslyBypassWorkspaceIsolationSecurity: boolean;
    } = {
      attributes: ["workspaceId"],
      // WORKSPACE_ISOLATION_BYPASS: resolving workspaceId from group ids to
      // invalidate the group_vaults cache.
      dangerouslyBypassWorkspaceIsolationSecurity: true,
      where: { id: groupIds },
      transaction: options.transaction,
    };
    const groups: GroupModel[] = await GroupModel.findAll(findOptions);
    scheduleInvalidation(
      groups.map((g) => g.workspaceId),
      options.transaction,
      "group_bulk_update"
    );
    return;
  }
  logger.error(
    { panic: true, where },
    "groups bulk update without derivable workspaceId: group_vaults cache not invalidated"
  );
});

// group_vaults cache read side.

function rehydrateVaultRows(cached: CachedVaultRows): GroupSpaceWithGroup[] {
  return cached.map(({ groupSpace, group }) => ({
    groupSpace: {
      ...groupSpace,
      createdAt: new Date(groupSpace.createdAtMs),
      updatedAt: new Date(groupSpace.updatedAtMs),
    },
    group: {
      ...group,
      createdAt: new Date(group.createdAtMs),
      updatedAt: new Date(group.updatedAtMs),
    },
  }));
}

export async function fetchGroupSpacesCachedForVaults(
  workspaceId: number,
  vaultIds: ModelId[]
): Promise<Map<ModelId, GroupSpaceWithGroup[]>> {
  if (vaultIds.length === 0) {
    return new Map();
  }
  const statsDClient = getStatsDClient();

  let redisCli: RedisClientType | null = null;
  let dataKey: string | null = null;
  try {
    redisCli = await getRedisCacheClient({ origin: "cache_with_redis" });

    // An absent version key (fresh workspace or eviction) gets a fresh version via
    // INCR, so a data key surviving from a lost version can never be read.
    const versionKey = groupSpacesCacheVersionKey(workspaceId);
    const rawVersion = await redisCli.get(versionKey);
    const version =
      rawVersion != null
        ? Number(rawVersion)
        : Number(await redisCli.incr(versionKey));

    if (Number.isFinite(version)) {
      dataKey = groupSpacesCacheDataKey(workspaceId, version);
      const values = await redisCli.hmGet(dataKey, [
        POPULATED_FIELD,
        ...vaultIds.map(String),
      ]);
      if (values[0] != null) {
        const byVault = new Map<ModelId, GroupSpaceWithGroup[]>();
        let parseFailed = false;
        for (const [i, vaultId] of vaultIds.entries()) {
          const value = values[i + 1];
          if (value == null) {
            byVault.set(vaultId, []);
            continue;
          }
          const parsed = cachedVaultRowsSchema.safeParse(JSON.parse(value));
          if (!parsed.success) {
            parseFailed = true;
            break;
          }
          byVault.set(vaultId, rehydrateVaultRows(parsed.data));
        }
        if (!parseFailed) {
          statsDClient.increment("group_spaces_cache.read", 1, ["result:hit"]);
          return byVault;
        }
      }
    }
  } catch (err) {
    // Redis unavailability must not take down space fetches.
    logger.warn(
      { err: normalizeError(err), workspaceId },
      "group_vaults cache read failed"
    );
    statsDClient.increment("group_spaces_cache.read", 1, ["result:error"]);
    dataKey = null;
  }

  const byVault = await fetchWorkspaceGroupSpacesFromDb(workspaceId);

  if (redisCli && dataKey) {
    try {
      const hashValues: Record<string, string> = { [POPULATED_FIELD]: "1" };
      for (const [vaultId, rows] of byVault) {
        hashValues[String(vaultId)] = JSON.stringify(serializeVaultRows(rows));
      }
      await redisCli.hSet(dataKey, hashValues);
      statsDClient.increment("group_spaces_cache.read", 1, ["result:miss"]);
    } catch (err) {
      logger.warn(
        { err: normalizeError(err), workspaceId },
        "group_vaults cache write failed"
      );
    }
  }

  const requested = new Map<ModelId, GroupSpaceWithGroup[]>();
  for (const vaultId of vaultIds) {
    requested.set(vaultId, byVault.get(vaultId) ?? []);
  }
  return requested;
}
