import { getWorkOS } from "@app/lib/api/workos/client";
import { invalidateWorkOSOrganizationsCacheForUserId } from "@app/lib/api/workos/organization_membership";
import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { MembershipModel } from "@app/lib/resources/storage/models/membership";
import { UserModel } from "@app/lib/resources/storage/models/user";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import {
  cacheWithRedis,
  invalidateCacheAfterCommit,
  invalidateCacheWithRedis,
} from "@app/lib/utils/cache";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger, { auditLog } from "@app/logger/logger";
import { launchIndexUserSearchWorkflow } from "@app/temporal/es_indexation/client";
import {
  initialCreditStateForSeatType,
  isMembershipSeatType,
  type MembershipOriginType,
  type MembershipRoleType,
  type MembershipSeatType,
  type UserCreditState,
} from "@app/types/memberships";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { RequireAtLeastOne } from "@app/types/shared/typescipt_utils";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { LightWorkspaceType, UserType } from "@app/types/user";
import assert from "assert";
import type {
  Attributes,
  FindOptions,
  IncludeOptions,
  InferAttributes,
  Transaction,
  WhereOptions,
} from "sequelize";
import { Op } from "sequelize";

type GetMembershipsOptions = RequireAtLeastOne<{
  users: UserResource[];
  workspace: LightWorkspaceType;
}> & {
  roles?: MembershipRoleType[];
  transaction?: Transaction;
};

export type MembershipsPaginationParams = {
  orderColumn: "createdAt";
  orderDirection: "asc" | "desc";
  lastValue?: number;
  limit: number;
};

type MembershipsWithTotal = {
  memberships: MembershipResource[];
  total: number;
  nextPageParams?: MembershipsPaginationParams;
};

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface MembershipResource
  extends ReadonlyAttributesType<MembershipModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class MembershipResource extends BaseResource<MembershipModel> {
  static model: ModelStaticWorkspaceAware<MembershipModel> = MembershipModel;

  readonly user?: Attributes<UserModel>;

  constructor(
    model: ModelStaticWorkspaceAware<MembershipModel>,
    blob: Attributes<MembershipModel>,
    { user }: { user?: Attributes<UserModel> } = {}
  ) {
    super(MembershipModel, blob);

    this.user = user;
  }

  get isBuilder(): boolean {
    switch (this.role) {
      case "admin":
      case "business_admin":
      case "builder":
        return true;
      case "user":
        return false;
      default:
        assertNever(this.role);
    }
  }

  static async getMembershipsForWorkspace({
    workspace,
    transaction,
    includeUser = false,
  }: {
    workspace: LightWorkspaceType;
    transaction?: Transaction;
    includeUser?: boolean;
  }): Promise<MembershipsWithTotal> {
    const orderedResourcesFromModels = (resources: MembershipModel[]) =>
      resources
        .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
        .map(
          (resource) =>
            new MembershipResource(MembershipModel, resource.get(), {
              user: resource.user?.get(),
            })
        );

    const whereClause: WhereOptions<InferAttributes<MembershipModel>> = {
      workspaceId: workspace.id,
    };

    const findOptions: FindOptions<InferAttributes<MembershipModel>> = {
      where: whereClause,
      transaction,
      include: includeUser ? [{ model: UserModel, required: true }] : [],
    };

    const { rows, count } = await MembershipModel.findAndCountAll(findOptions);

    return { memberships: orderedResourcesFromModels(rows), total: count };
  }

  static async getActiveMemberships({
    users,
    workspace,
    roles,
    transaction,
    paginationParams,
  }: GetMembershipsOptions & {
    paginationParams?: MembershipsPaginationParams;
  }): Promise<MembershipsWithTotal> {
    if (!workspace && !users?.length) {
      throw new Error("At least one of workspace or userIds must be provided.");
    }

    const whereClause: WhereOptions<InferAttributes<MembershipModel>> = {
      startAt: {
        [Op.lte]: new Date(),
      },
      endAt: {
        [Op.or]: [{ [Op.eq]: null }, { [Op.gte]: new Date() }],
      },
    };

    const paginationWhereClause: WhereOptions<
      InferAttributes<MembershipModel>
    > = {};

    const includeClause: IncludeOptions[] = [];

    if (users) {
      whereClause.userId = users.map((u) => u.id);
    } else {
      includeClause.push({
        model: UserModel,
        required: true,
      });
    }

    if (workspace) {
      whereClause.workspaceId = workspace.id;
    }
    if (roles) {
      whereClause.role = {
        [Op.in]: roles,
      };
    }

    const findOptions: FindOptions<InferAttributes<MembershipModel>> = {
      where: whereClause,
      include: includeClause,
      transaction,
    };

    if (paginationParams) {
      const { limit, orderColumn, orderDirection, lastValue } =
        paginationParams;

      if (lastValue) {
        const op = orderDirection === "desc" ? Op.lt : Op.gt;
        switch (orderColumn) {
          case "createdAt":
            paginationWhereClause[orderColumn] = {
              [op]: new Date(lastValue),
            };
            break;
          default:
            assertNever(orderColumn);
        }
      }

      findOptions.order = [
        [orderColumn, orderDirection === "desc" ? "DESC" : "ASC"],
      ];
      findOptions.limit = limit;
    }

    const rows = await this.model.findAll({
      ...findOptions,
      where: { ...findOptions.where, ...paginationWhereClause },
      // WORKSPACE_ISOLATION_BYPASS: We could fetch via workspaceId or via userIds, check is done above
      // biome-ignore lint/plugin/noUnverifiedWorkspaceBypass: WORKSPACE_ISOLATION_BYPASS verified
      dangerouslyBypassWorkspaceIsolationSecurity: true,
    });

    let count = rows.length;

    // Only do the count if we are paginating, otherwise we can use the length of the rows as there is no limit by default
    if (paginationParams) {
      // Need a separate query to get the total count, findAndCountAll does not support pagination based on where clause.
      count = await MembershipModel.count(findOptions);
    }

    let nextPageParams: MembershipsPaginationParams | undefined;
    if (paginationParams?.limit && rows.length === paginationParams.limit) {
      const lastRow = rows[rows.length - 1];
      let lastValue: number;
      switch (paginationParams.orderColumn) {
        case "createdAt":
          lastValue = lastRow.createdAt.getTime();
          break;
        default:
          assertNever(paginationParams.orderColumn);
      }

      nextPageParams = {
        ...paginationParams,
        lastValue,
      };
    }

    return {
      memberships: rows.map(
        (membership) =>
          new MembershipResource(MembershipModel, membership.get(), {
            user: membership.user?.get(),
          })
      ),
      total: count,
      nextPageParams,
    };
  }

  /**
   * Return memberships whose `startAt` is strictly in the future for the given
   * workspace — i.e. scheduled seat-type changes that haven't taken effect yet.
   *
   * Pairs with `scheduleSeatChange`, which writes exactly one future row per
   * user (it destroys any prior future row first), so the result is at most
   * one row per user. The "previous" seat type for each future row lives on
   * the currently-active membership for that user.
   *
   * Used by `syncSeatCount` to reconcile Metronome's future-dated seat
   * segments with the DB state.
   */
  static async getScheduledFutureMemberships({
    workspace,
    transaction,
  }: {
    workspace: LightWorkspaceType;
    transaction?: Transaction;
  }): Promise<MembershipResource[]> {
    const rows = await MembershipModel.findAll({
      where: {
        workspaceId: workspace.id,
        startAt: { [Op.gt]: new Date() },
      },
      include: [{ model: UserModel, required: true }],
      transaction,
    });
    return rows.map(
      (row) =>
        new MembershipResource(MembershipModel, row.get(), {
          user: row.user?.get(),
        })
    );
  }

  static async getLatestMemberships({
    users,
    workspace,
    roles,
    transaction,
    paginationParams,
  }: GetMembershipsOptions & {
    paginationParams?: MembershipsPaginationParams;
  }): Promise<MembershipsWithTotal> {
    const orderedResourcesFromModels = (resources: MembershipModel[]) =>
      resources
        .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
        .map(
          (resource) => new MembershipResource(MembershipModel, resource.get())
        );

    const whereClause: WhereOptions<InferAttributes<MembershipModel>> = {};
    if (roles) {
      whereClause.role = roles;
    }
    if (users) {
      whereClause.userId = users.map((u) => u.id);
    }
    if (workspace) {
      whereClause.workspaceId = workspace.id;
    }

    if (!workspace && !users?.length) {
      throw new Error("At least one of workspace or userIds must be provided.");
    }
    if (users && !users.length) {
      return {
        memberships: [],
        total: 0,
      };
    }

    const findOptions: FindOptions<InferAttributes<MembershipModel>> = {
      where: whereClause,
      transaction,
    };

    if (paginationParams) {
      const { limit, orderColumn, orderDirection, lastValue } =
        paginationParams;

      if (lastValue) {
        const op = orderDirection === "desc" ? Op.lt : Op.gt;
        whereClause[orderColumn as any] = {
          [op]: lastValue,
        };
      }

      findOptions.order = [
        [orderColumn, orderDirection === "desc" ? "DESC" : "ASC"],
      ];
      findOptions.limit = limit;
    }

    // Get all the memberships matching the criteria.
    const rows = await this.model.findAll({
      ...findOptions,
      // WORKSPACE_ISOLATION_BYPASS: Used to find latest memberships across users and workspace is
      // optional.
      // biome-ignore lint/plugin/noUnverifiedWorkspaceBypass: WORKSPACE_ISOLATION_BYPASS verified
      dangerouslyBypassWorkspaceIsolationSecurity: true,
    });

    let count = rows.length;

    // Only do the count if we are paginating, otherwise we can use the length of the rows as there is no limit by default
    if (paginationParams) {
      count = await MembershipModel.count(findOptions);
    }

    // Then, we only keep the latest membership for each (user, workspace).
    const latestMembershipByUserAndWorkspace = new Map<
      string,
      MembershipModel
    >();
    for (const m of rows) {
      const key = `${m.userId}__${m.workspaceId}`;
      const latest = latestMembershipByUserAndWorkspace.get(key);
      if (!latest || latest.startAt < m.startAt) {
        latestMembershipByUserAndWorkspace.set(key, m);
      }
    }

    return {
      memberships: orderedResourcesFromModels(
        Array.from(latestMembershipByUserAndWorkspace.values())
      ),
      total: count,
    };
  }

  /**
   * Returns the most recent membership row by `startAt` (still excluding
   * future-dated rows), regardless of revocation state. Used by call sites
   * that need to detect a previously-revoked membership.
   *
   * Use `getActiveMembershipOfUserInWorkspace` for "active right now".
   */
  static async getLatestMembershipOfUserInWorkspace({
    user,
    workspace,
    transaction,
  }: {
    user: UserResource;
    workspace: LightWorkspaceType;
    transaction?: Transaction;
  }): Promise<MembershipResource | null> {
    const row = await this.model.findOne({
      where: {
        userId: user.id,
        workspaceId: workspace.id,
        startAt: { [Op.lte]: new Date() },
      },
      order: [["startAt", "DESC"]],
      transaction,
    });
    return row ? new MembershipResource(this.model, row.get()) : null;
  }

  /**
   * Returns true when the user has *any* prior membership row in the
   * workspace — current, future-scheduled, or revoked. Used to enforce
   * that `"free"` is a one-shot starter tier: it can only be assigned at
   * the very first membership creation; any subsequent change refuses
   * `"free"` (including re-joining after revoke).
   */
  static async hasAnyMembershipOfUserInWorkspace({
    user,
    workspace,
    transaction,
  }: {
    user: UserResource;
    workspace: LightWorkspaceType;
    transaction?: Transaction;
  }): Promise<boolean> {
    const count = await this.model.count({
      where: {
        userId: user.id,
        workspaceId: workspace.id,
      },
      transaction,
    });
    return count > 0;
  }

  /**
   * Returns the future-scheduled membership row for the user (startAt > NOW)
   * if any. Used to detect / consume scheduled seat changes.
   */
  static async getScheduledMembershipOfUserInWorkspace({
    user,
    workspace,
    transaction,
  }: {
    user: UserResource;
    workspace: LightWorkspaceType;
    transaction?: Transaction;
  }): Promise<MembershipResource | null> {
    const row = await this.model.findOne({
      where: {
        userId: user.id,
        workspaceId: workspace.id,
        startAt: { [Op.gt]: new Date() },
      },
      transaction,
    });
    return row ? new MembershipResource(this.model, row.get()) : null;
  }

  /**
   * Returns the next-scheduled membership row keyed by userId for the given
   * users in a workspace. Single query for use by paginated listings.
   */
  static async getScheduledMembershipsByUserIdInWorkspace({
    workspace,
    userIds,
  }: {
    workspace: LightWorkspaceType;
    userIds: ModelId[];
  }): Promise<Map<ModelId, MembershipResource>> {
    if (userIds.length === 0) {
      return new Map();
    }
    const rows = await this.model.findAll({
      where: {
        workspaceId: workspace.id,
        userId: userIds,
        startAt: { [Op.gt]: new Date() },
      },
    });
    const result = new Map<ModelId, MembershipResource>();
    for (const row of rows) {
      const resource = new MembershipResource(this.model, row.get());
      const existing = result.get(row.userId);
      if (!existing || row.startAt < existing.startAt) {
        result.set(row.userId, resource);
      }
    }
    return result;
  }

  private static readonly roleCacheKeyResolver = ({
    userModelId,
    workspaceModelId,
  }: {
    userModelId: ModelId;
    workspaceModelId: ModelId;
  }) => `role:user:${userModelId}:workspace:${workspaceModelId}`;

  private static async _getActiveRoleForUserInWorkspaceUncached({
    userModelId,
    workspaceModelId,
    transaction,
  }: {
    userModelId: ModelId;
    workspaceModelId: ModelId;
    transaction?: Transaction;
  }): Promise<MembershipRoleType | "none"> {
    const membership = await MembershipModel.findOne({
      attributes: ["role"],
      where: {
        userId: userModelId,
        workspaceId: workspaceModelId,
        startAt: {
          [Op.lte]: new Date(),
        },
        endAt: {
          [Op.or]: [{ [Op.eq]: null }, { [Op.gte]: new Date() }],
        },
      },
      transaction,
    });
    return membership?.role ?? "none";
  }

  // Cache eviction is handled by Redis's allkeys-lfu eviction policy.
  private static getActiveRoleForUserInWorkspaceCached = cacheWithRedis(
    MembershipResource._getActiveRoleForUserInWorkspaceUncached,
    (params: { userModelId: ModelId; workspaceModelId: ModelId }) =>
      MembershipResource.roleCacheKeyResolver(params),
    { cacheNullValues: false }
  );

  private static _invalidateRoleCache = invalidateCacheWithRedis(
    MembershipResource._getActiveRoleForUserInWorkspaceUncached,
    (params: { userModelId: ModelId; workspaceModelId: ModelId }) =>
      MembershipResource.roleCacheKeyResolver(params)
  );

  private static invalidateRoleCache = async (params: {
    userModelId: ModelId;
    workspaceModelId: ModelId;
  }) => {
    logger.info(
      {
        userModelId: params.userModelId,
        workspaceModelId: params.workspaceModelId,
        method: "MembershipResource.invalidateRoleCache",
      },
      "Invalidating auth resource cache"
    );
    return MembershipResource._invalidateRoleCache(params);
  };

  static async getActiveRoleForUserInWorkspace({
    user,
    workspace,
    transaction,
  }: {
    user: UserResource;
    workspace: LightWorkspaceType;
    transaction?: Transaction;
  }): Promise<MembershipRoleType | "none"> {
    if (transaction) {
      logger.info(
        {
          userModelId: user.id,
          workspaceModelId: workspace.id,
          method: "MembershipResource.getActiveRoleForUserInWorkspace",
        },
        "Skipping auth resource cache: transaction provided"
      );
      return this._getActiveRoleForUserInWorkspaceUncached({
        userModelId: user.id,
        workspaceModelId: workspace.id,
        transaction,
      });
    }
    return this.getActiveRoleForUserInWorkspaceCached({
      userModelId: user.id,
      workspaceModelId: workspace.id,
    });
  }

  static async getActiveMembershipOfUserInWorkspace({
    user,
    workspace,
    transaction,
  }: {
    user: UserResource;
    workspace: LightWorkspaceType;
    transaction?: Transaction;
  }): Promise<MembershipResource | null> {
    const { memberships, total } = await this.getActiveMemberships({
      users: [user],
      workspace,
      transaction,
    });
    if (total === 0) {
      return null;
    }
    if (total > 1) {
      logger.error(
        {
          panic: true,
          userId: user.id,
          workspaceId: workspace.id,
          memberships,
        },
        "Unreachable: Found multiple active memberships for user in workspace."
      );
      throw new Error(
        `Unreachable: Found multiple active memberships for user ${user.id} in workspace ${workspace.id}`
      );
    }
    return memberships[0];
  }

  static async getMembersCountForWorkspace({
    workspace,
    activeOnly,
    rolesFilter,
    transaction,
    membershipSpan,
  }: {
    workspace: LightWorkspaceType;
    activeOnly: boolean;
    rolesFilter?: MembershipRoleType[];
    transaction?: Transaction;
    membershipSpan?: { fromDate: Date; toDate: Date };
  }): Promise<number> {
    const fromDate = membershipSpan?.fromDate ?? new Date();
    const toDate = membershipSpan?.toDate ?? new Date();
    const where: WhereOptions<InferAttributes<MembershipModel>> = activeOnly
      ? {
          endAt: {
            [Op.or]: [{ [Op.eq]: null }, { [Op.gte]: fromDate }],
          },
          startAt: {
            [Op.lte]: toDate,
          },
          firstUsedAt: {
            [Op.ne]: null,
          },
        }
      : {};

    if (rolesFilter && rolesFilter.length !== 0) {
      where.role = {
        [Op.in]: rolesFilter,
      };
    }

    where.workspaceId = workspace.id;

    return MembershipModel.count({
      where,
      distinct: true,
      col: "userId",
      transaction,
    });
  }

  static async getMembersCountsForWorkspaces(
    auth: Authenticator,
    {
      workspaces,
      activeOnly,
    }: {
      workspaces: LightWorkspaceType[];
      activeOnly: boolean;
    }
  ): Promise<Record<string, number>> {
    assert(
      auth.isDustSuperUser(),
      "Counting members across different workspaces is only allowed for super users."
    );

    const countByWorkspaceId: Record<string, number> = {};
    if (workspaces.length === 0) {
      return countByWorkspaceId;
    }

    const workspaceIdByModelId = new Map<ModelId, string>();
    for (const w of workspaces) {
      countByWorkspaceId[w.sId] = 0;
      workspaceIdByModelId.set(w.id, w.sId);
    }

    const now = new Date();
    let where: WhereOptions<InferAttributes<MembershipModel>> = {
      workspaceId: { [Op.in]: workspaces.map((w) => w.id) },
    };
    if (activeOnly) {
      where = {
        ...where,
        endAt: { [Op.or]: [{ [Op.eq]: null }, { [Op.gte]: now }] },
        startAt: { [Op.lte]: now },
        firstUsedAt: { [Op.ne]: null },
      };
    }

    const rows = await this.model.count({
      where,
      distinct: true,
      col: "userId",
      group: ["workspaceId"],
    });

    for (const row of rows) {
      const workspaceModelId = row.workspaceId;
      if (typeof workspaceModelId === "number") {
        const workspaceId = workspaceIdByModelId.get(workspaceModelId);
        if (workspaceId) {
          countByWorkspaceId[workspaceId] = row.count;
        }
      }
    }
    return countByWorkspaceId;
  }

  static async countActiveMembersForWorkspace({
    workspace,
  }: {
    workspace: LightWorkspaceType;
  }): Promise<number> {
    const now = new Date();
    return MembershipModel.count({
      where: {
        workspaceId: workspace.id,
        startAt: {
          [Op.lte]: now,
        },
        endAt: {
          [Op.or]: [{ [Op.eq]: null }, { [Op.gte]: now }],
        },
      },
      distinct: true,
      col: "userId",
    });
  }

  static async getActiveSeatTypeCountsForWorkspace({
    workspace,
    transaction,
  }: {
    workspace: LightWorkspaceType;
    transaction?: Transaction;
  }): Promise<Partial<Record<MembershipSeatType, number>>> {
    const now = new Date();
    const rows = await this.model.count({
      where: {
        workspaceId: workspace.id,
        startAt: {
          [Op.lte]: now,
        },
        endAt: {
          [Op.or]: [{ [Op.eq]: null }, { [Op.gte]: now }],
        },
      },
      distinct: true,
      col: "userId",
      group: ["seatType"],
      transaction,
    });

    const counts: Partial<Record<MembershipSeatType, number>> = {};
    for (const row of rows) {
      const { seatType } = row;
      if (isMembershipSeatType(seatType)) {
        counts[seatType] = row.count;
      }
    }

    return counts;
  }

  /**
   * Counts used to enforce the plan-level `free`-seat caps
   * (`plan.limits.users.maxFreeUsers` / `maxLifetimeFreeUsers`).
   *
   *  - `active`:   distinct users with a currently-active `free` row.
   *  - `lifetime`: distinct users ever assigned `free` (active + revoked
   *    + expired). `free` is a one-shot starter tier, so the lifetime
   *    count is the right denominator for the cap.
   */
  static async getFreeSeatCounts({
    workspace,
  }: {
    workspace: LightWorkspaceType;
  }): Promise<{ active: number; lifetime: number }> {
    const now = new Date();
    const [active, lifetime] = await Promise.all([
      MembershipModel.count({
        where: {
          workspaceId: workspace.id,
          seatType: "free",
          startAt: { [Op.lte]: now },
          endAt: { [Op.or]: [{ [Op.eq]: null }, { [Op.gte]: now }] },
        },
        distinct: true,
        col: "userId",
      }),
      MembershipModel.count({
        where: { workspaceId: workspace.id, seatType: "free" },
        distinct: true,
        col: "userId",
      }),
    ]);
    return { active, lifetime };
  }

  /**
   * Computes the number of active members at each given timestamp (end of day).
   * Fetches all memberships overlapping the date range in a single query,
   * then counts distinct users in-memory for each day.
   */
  static async countActiveMembersPerDay({
    workspace,
    timestampsMs,
  }: {
    workspace: LightWorkspaceType;
    timestampsMs: readonly number[];
  }): Promise<Map<number, number>> {
    const result = new Map<number, number>();
    if (timestampsMs.length === 0) {
      return result;
    }

    const sorted = [...timestampsMs].sort((a, b) => a - b);
    const rangeStartDate = new Date(sorted[0]);
    // Use end of day for the last timestamp to capture the full day.
    const rangeEndDate = new Date(sorted[sorted.length - 1]);
    rangeEndDate.setUTCHours(23, 59, 59, 999);

    // Fetch all memberships that overlap with [rangeStart, rangeEnd]:
    // startAt <= rangeEnd AND (endAt IS NULL OR endAt >= rangeStart).
    // Include userId to deduplicate users with multiple membership records.
    const memberships = await MembershipModel.findAll({
      attributes: ["userId", "startAt", "endAt"],
      where: {
        workspaceId: workspace.id,
        startAt: { [Op.lte]: rangeEndDate },
        endAt: {
          [Op.or]: [{ [Op.eq]: null }, { [Op.gte]: rangeStartDate }],
        },
      },
    });

    // O(timestamps x memberships) -- acceptable: timestamps is bounded by the
    // analytics period (typically <= 90 days) and memberships by workspace size
    // (typically < 5000). Use a Set to count distinct users per day.
    for (const ts of timestampsMs) {
      const dayEnd = new Date(ts);
      dayEnd.setUTCHours(23, 59, 59, 999);
      const dayStart = new Date(ts);
      dayStart.setUTCHours(0, 0, 0, 0);
      const activeUserIds = new Set<number>();
      for (const m of memberships) {
        if (m.startAt <= dayEnd && (!m.endAt || m.endAt >= dayStart)) {
          activeUserIds.add(m.userId);
        }
      }
      result.set(ts, activeUserIds.size);
    }

    return result;
  }

  // Seat counting with caching - used to track active seats in a workspace
  private static readonly seatsCacheKeyResolver = (workspaceId: string) =>
    `count-active-seats-in-workspace:${workspaceId}`;

  private static async _countActiveSeatsInWorkspaceUncached(
    workspaceId: string
  ): Promise<number> {
    const workspace = await WorkspaceResource.fetchById(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace not found for sId: ${workspaceId}`);
    }

    return MembershipResource.getMembersCountForWorkspace({
      workspace: renderLightWorkspaceType({ workspace }),
      activeOnly: true,
    });
  }

  // Cache eviction is handled by Redis's allkeys-lfu eviction policy.
  private static countActiveSeatsInWorkspaceCached = cacheWithRedis(
    MembershipResource._countActiveSeatsInWorkspaceUncached,
    MembershipResource.seatsCacheKeyResolver,
    { cacheNullValues: false }
  );

  private static invalidateActiveSeatsCache = invalidateCacheWithRedis(
    MembershipResource._countActiveSeatsInWorkspaceUncached,
    MembershipResource.seatsCacheKeyResolver
  );

  static async countActiveSeatsInWorkspace(
    workspaceId: string
  ): Promise<number> {
    return this.countActiveSeatsInWorkspaceCached(workspaceId);
  }

  protected override async update(
    blob: Partial<Attributes<MembershipModel>>,
    transaction?: Transaction
  ): Promise<[affectedCount: number]> {
    const result = await super.update(blob, transaction);

    const [workspace] = await WorkspaceResource.fetchByModelIds([
      this.workspaceId,
    ]);
    if (workspace) {
      const workspaceId = workspace.sId;
      invalidateCacheAfterCommit(transaction, () =>
        MembershipResource.invalidateActiveSeatsCache(workspaceId)
      );
    }

    return result;
  }

  async markFirstUse(): Promise<boolean> {
    if (this.firstUsedAt !== null) {
      return false;
    }

    await this.update({ firstUsedAt: new Date() });

    return true;
  }

  async updateCreditState(
    creditState: UserCreditState,
    transaction?: Transaction
  ): Promise<void> {
    await this.update({ creditState }, transaction);
  }

  static async deleteAllForWorkspace(auth: Authenticator) {
    const workspace = auth.getNonNullableWorkspace();

    if (workspace.workOSOrganizationId) {
      try {
        const workos = getWorkOS();

        const memberships =
          await workos.userManagement.listOrganizationMemberships({
            organizationId: workspace.workOSOrganizationId,
          });

        await concurrentExecutor(
          memberships.data,
          async (membership) => {
            await workos.userManagement.deleteOrganizationMembership(
              membership.id
            );
          },
          { concurrency: 10 }
        );
      } catch (error) {
        logger.error(
          {
            workspaceId: workspace.id,
            error,
          },
          "Failed to delete WorkOS memberships for workspace"
        );
      }
    }

    const result = await this.model.destroy({
      where: { workspaceId: workspace.id },
    });

    await MembershipResource.invalidateActiveSeatsCache(workspace.sId);

    return result;
  }

  /**
   * Caller of this method should call `ServerSideTracking.trackCreateMembership`.
   */
  static async createMembership({
    user,
    workspace,
    role,
    origin = "invited",
    seatType = "workspace",
    startAt = new Date(),
    transaction,
  }: {
    user: UserResource;
    workspace: LightWorkspaceType;
    role: MembershipRoleType;
    origin?: MembershipOriginType;
    seatType?: MembershipSeatType;
    startAt?: Date;
    transaction?: Transaction;
  }): Promise<MembershipResource> {
    if (startAt > new Date()) {
      throw new Error("Cannot create a membership in the future");
    }
    if (
      await MembershipModel.count({
        where: {
          userId: user.id,
          workspaceId: workspace.id,
          endAt: {
            [Op.or]: [{ [Op.eq]: null }, { [Op.gt]: startAt }],
          },
        },
        transaction,
      })
    ) {
      throw new Error(
        `User ${user.id} already has an active membership in workspace ${workspace.id}`
      );
    }
    const newMembership = await MembershipModel.create(
      {
        startAt,
        userId: user.id,
        workspaceId: workspace.id,
        role,
        origin,
        seatType,
        // Optimistic initial state from the seat type (pro/max → user_seat) so a
        // new seat user isn't stuck at the "on_pool" DB default during the seat
        // sync's debounce window; the post-sync reconcile refines it from the
        // live Metronome balance.
        creditState: initialCreditStateForSeatType(seatType),
        firstUsedAt: origin === "provisioned" ? null : new Date(),
      },
      { transaction }
    );

    await this.updateWorkOSMembershipRole({
      user,
      workspace,
      newRole: role,
    });

    // Update user search index across all workspaces
    const workflowResult = await launchIndexUserSearchWorkflow({
      userId: user.sId,
    });
    if (workflowResult.isErr()) {
      // Throw if it fails to launch (unexpected).
      throw workflowResult.error;
    }

    // Invalidate the active seats cache for this workspace.
    const workspaceId = workspace.sId;
    const userModelId = user.id;
    const workspaceModelId = workspace.id;
    invalidateCacheAfterCommit(transaction, async () => {
      await MembershipResource.invalidateActiveSeatsCache(workspaceId);
      await MembershipResource.invalidateRoleCache({
        userModelId,
        workspaceModelId,
      });
    });

    return new MembershipResource(MembershipModel, newMembership.get());
  }

  static async fetchByUserIds(
    userIds: ModelId[]
  ): Promise<MembershipResource[]> {
    const membershipModels = await this.model.findAll({
      where: {
        userId: userIds,
      },
      // WORKSPACE_ISOLATION_BYPASS: fetch by userIds
      // biome-ignore lint/plugin/noUnverifiedWorkspaceBypass: WORKSPACE_ISOLATION_BYPASS verified
      dangerouslyBypassWorkspaceIsolationSecurity: true,
    });
    return membershipModels.map(
      (m) => new MembershipResource(this.model, m.get())
    );
  }

  // Use `revokeAndTrackMembership` from `@app/lib/api/membership` instead which
  // handles tracking and usage updates.
  static async revokeMembership({
    user,
    workspace,
    endAt = new Date(),
    transaction,
    allowLastAdminRevocation = false,
  }: {
    user: UserResource;
    workspace: LightWorkspaceType;
    endAt?: Date;
    transaction?: Transaction;
    allowLastAdminRevocation?: boolean;
  }): Promise<
    Result<
      { role: MembershipRoleType; startAt: Date; endAt: Date },
      {
        type: "not_found" | "already_revoked" | "invalid_end_at" | "last_admin";
      }
    >
  > {
    const membership = await this.getLatestMembershipOfUserInWorkspace({
      user,
      workspace,
      transaction,
    });
    if (!membership) {
      return new Err({ type: "not_found" });
    }
    if (endAt < membership.startAt) {
      return new Err({ type: "invalid_end_at" });
    }
    if (membership.endAt && membership.endAt < new Date()) {
      return new Err({ type: "already_revoked" });
    }

    // Prevent revoking the last admin of a workspace.
    if (membership.role === "admin" && !allowLastAdminRevocation) {
      const adminsCount = await this.getMembersCountForWorkspace({
        workspace,
        activeOnly: true,
        rolesFilter: ["admin"],
        transaction,
      });

      if (adminsCount < 2) {
        return new Err({ type: "last_admin" });
      }
    }

    await MembershipModel.update(
      { endAt },
      { where: { id: membership.id }, transaction }
    );

    // Drop any future-scheduled seat-change rows so they don't reactivate the
    // user after the revoke date.
    await MembershipModel.destroy({
      where: {
        userId: user.id,
        workspaceId: workspace.id,
        startAt: { [Op.gt]: new Date() },
      },
      transaction,
    });

    if (workspace.workOSOrganizationId && user.workOSUserId) {
      try {
        const workos = getWorkOS();

        const workOSMemberships =
          await workos.userManagement.listOrganizationMemberships({
            organizationId: workspace.workOSOrganizationId,
            userId: user.workOSUserId,
          });

        if (workOSMemberships.data.length > 0) {
          await workos.userManagement.deleteOrganizationMembership(
            workOSMemberships.data[0].id
          );
        }
      } catch (error) {
        logger.error(
          {
            workspaceId: workspace.id,
            userId: user.id,
            error,
          },
          "Failed to delete WorkOS membership"
        );
      }
    }

    // Update user search index across all workspaces
    const workflowResult = await launchIndexUserSearchWorkflow({
      userId: user.sId,
    });
    if (workflowResult.isErr()) {
      // Throw if it fails to launch (unexpected).
      throw workflowResult.error;
    }

    // Invalidate the active seats cache for this workspace.
    const workspaceId = workspace.sId;
    const userModelId = user.id;
    const workspaceModelId = workspace.id;
    invalidateCacheAfterCommit(transaction, async () => {
      await MembershipResource.invalidateActiveSeatsCache(workspaceId);
      await MembershipResource.invalidateRoleCache({
        userModelId,
        workspaceModelId,
      });
    });

    // We do not invalidate GroupMembership here
    // because WorkspaceMembership is tested before GroupMembership
    // in  lib/auth

    return new Ok({
      role: membership.role,
      startAt: membership.startAt,
      endAt,
    });
  }

  /**
   * Caller of this method should call `ServerSideTracking.trackUpdateMembershipRole`.
   */
  static async updateMembershipRole({
    user,
    workspace,
    newRole,
    allowTerminated = false,
    allowLastAdminRemoval = false,
    transaction,
    author,
  }: {
    user: UserResource;
    workspace: LightWorkspaceType;
    newRole: Exclude<MembershipRoleType, "revoked">;
    // If true, allow updating the role of a terminated membership (which will also un-terminate it).
    allowTerminated?: boolean;
    allowLastAdminRemoval?: boolean;
    transaction?: Transaction;
    author: UserType | "no-author";
  }): Promise<
    Result<
      { previousRole: MembershipRoleType; newRole: MembershipRoleType },
      {
        type:
          | "not_found"
          | "already_on_role"
          | "membership_already_terminated"
          | "last_admin";
      }
    >
  > {
    const membership = await this.getLatestMembershipOfUserInWorkspace({
      user,
      workspace,
      transaction,
    });

    const isRevoked = !!(membership?.endAt && membership.endAt < new Date());
    if (isRevoked && !allowTerminated) {
      return new Err({ type: "membership_already_terminated" });
    }
    if (!membership) {
      return new Err({ type: "not_found" });
    }

    const previousRole = membership.role;

    // If the membership is not terminated, we update the role in place.
    // We do not historicize the roles.
    if (!isRevoked) {
      if (previousRole === newRole) {
        return new Err({ type: "already_on_role" });
      }

      // If the previous role was admin, we need to check if there is another admin in the workspace.
      if (previousRole == "admin") {
        const adminsCount = await this.getMembersCountForWorkspace({
          workspace,
          activeOnly: true,
          rolesFilter: ["admin"],
          transaction,
        });

        if (adminsCount < 2) {
          if (allowLastAdminRemoval) {
            logger.warn(
              {
                panic: false,
                userId: user.id,
                workspaceId: workspace.id,
              },
              "Removing the last admin from the workspace, we are allowing it because canForceUserRole() returns true."
            );
          } else {
            return new Err({ type: "last_admin" });
          }
        }
      }

      await MembershipModel.update(
        { role: newRole },
        { where: { id: membership.id }, transaction }
      );

      const workspaceId = workspace.sId;
      const userModelId = user.id;
      const workspaceModelId = workspace.id;
      invalidateCacheAfterCommit(transaction, async () => {
        await MembershipResource.invalidateActiveSeatsCache(workspaceId);
        await MembershipResource.invalidateRoleCache({
          userModelId,
          workspaceModelId,
        });
      });

      await this.updateWorkOSMembershipRole({
        user,
        workspace,
        newRole,
      });
    } else {
      // If the last membership was terminated, we create a new membership with the new role.
      // Preserve the origin and seatType from the previous membership.
      await this.createMembership({
        user,
        workspace,
        role: newRole,
        origin: membership.origin,
        seatType: membership.seatType,
        startAt: new Date(),
        transaction,
      });
    }

    auditLog(
      {
        author,
        userId: user.id,
        workspaceId: workspace.id,
        previousRole,
        newRole,
      },
      "Membership role updated"
    );

    // Update user search index across all workspaces
    const workflowResult = await launchIndexUserSearchWorkflow({
      userId: user.sId,
    });
    if (workflowResult.isErr()) {
      // Throw if it fails to launch (unexpected).
      throw workflowResult.error;
    }

    return new Ok({ previousRole, newRole });
  }

  static async updateWorkOSMembershipRole({
    user,
    workspace,
    newRole,
  }: {
    user: UserResource;
    workspace: LightWorkspaceType;
    newRole: Exclude<MembershipRoleType, "revoked">;
  }): Promise<void> {
    if (workspace.workOSOrganizationId && user.workOSUserId) {
      try {
        const workos = getWorkOS();
        const workOSMemberships =
          await workos.userManagement.listOrganizationMemberships({
            organizationId: workspace.workOSOrganizationId,
            userId: user.workOSUserId,
          });
        if (workOSMemberships.data.length > 0) {
          await workos.userManagement.updateOrganizationMembership(
            workOSMemberships.data[0].id,
            {
              roleSlug: newRole,
            }
          );
        } else {
          await workos.userManagement.createOrganizationMembership({
            userId: user.workOSUserId,
            organizationId: workspace.workOSOrganizationId,
            roleSlug: newRole,
          });
        }

        await invalidateWorkOSOrganizationsCacheForUserId(user.workOSUserId);
      } catch (error) {
        logger.error(
          {
            workspaceId: workspace.id,
            userId: user.id,
            error,
          },
          "Failed to udpate WorkOS membership"
        );
      }
    }
  }

  /**
   * Update the origin of an active membership.
   */
  async updateOrigin({
    user,
    workspace,
    newOrigin,
    transaction,
    author,
  }: {
    user: UserResource;
    workspace: LightWorkspaceType;
    newOrigin: MembershipOriginType;
    transaction?: Transaction;
    author: UserType | "no-author";
  }): Promise<{
    previousOrigin: MembershipOriginType;
    newOrigin: MembershipOriginType;
  }> {
    const previousOrigin = this.origin;

    await this.update({ origin: newOrigin }, transaction);

    auditLog(
      {
        author,
        userId: user.id,
        workspaceId: workspace.id,
        previousOrigin,
        newOrigin,
      },
      "Membership origin updated"
    );

    return { previousOrigin, newOrigin };
  }

  /**
   * Update the seatType of an active membership in place. Callers are
   * responsible for syncing seat state in Metronome before this returns
   * (via `syncSeatCount`).
   */
  async updateMembershipSeat({
    user,
    workspace,
    newSeatType,
    transaction,
    author,
  }: {
    user: UserResource;
    workspace: LightWorkspaceType;
    newSeatType: MembershipSeatType;
    transaction?: Transaction;
    author: UserType | "no-author";
  }): Promise<{
    previousSeatType: MembershipSeatType;
    newSeatType: MembershipSeatType;
  }> {
    const previousSeatType = this.seatType;
    if (previousSeatType === newSeatType) {
      return { previousSeatType, newSeatType };
    }

    await this.update({ seatType: newSeatType }, transaction);

    auditLog(
      {
        author,
        userId: user.id,
        workspaceId: workspace.id,
        previousSeatType,
        newSeatType,
      },
      "Membership seat type updated"
    );

    return { previousSeatType, newSeatType };
  }

  /**
   * Update the per-user pool cap override (in AWU credits, seat allowance
   * excluded) of an active membership in place. `null` clears the override,
   * letting the seat-type default apply. Callers are responsible for syncing
   * the derived Metronome alerts.
   */
  async updatePoolCapOverride(
    poolCapOverrideAwuCredits: number | null,
    transaction?: Transaction
  ): Promise<void> {
    await this.update({ poolCapOverrideAwuCredits }, transaction);
  }

  /**
   * Schedule a seat-type change at a future date by closing the current
   * row at `scheduledAt` and inserting a future row that becomes active
   * once `scheduledAt` is reached. Both rows coexist during the window;
   * only the future one has `endAt = null`, preserving the unique
   * `WHERE endAt IS NULL` invariant.
   */
  async scheduleSeatChange({
    user,
    workspace,
    newSeatType,
    scheduledAt,
    author,
  }: {
    user: UserResource;
    workspace: LightWorkspaceType;
    newSeatType: MembershipSeatType;
    scheduledAt: Date;
    author: UserType | "no-author";
  }): Promise<void> {
    const previousSeatType = this.seatType;
    await frontSequelize.transaction(async (transaction) => {
      // Replace any existing future row (re-scheduling is idempotent).
      await MembershipModel.destroy({
        where: {
          userId: user.id,
          workspaceId: workspace.id,
          startAt: { [Op.gt]: new Date() },
        },
        transaction,
      });
      await this.update({ endAt: scheduledAt }, transaction);
      await MembershipModel.create(
        {
          startAt: scheduledAt,
          userId: user.id,
          workspaceId: workspace.id,
          role: this.role,
          origin: this.origin,
          seatType: newSeatType,
          firstUsedAt: this.firstUsedAt,
          // The pool cap override survives the seat change: it's the
          // pool-only portion, independent of the seat allowance.
          poolCapOverrideAwuCredits: this.poolCapOverrideAwuCredits,
        },
        { transaction }
      );
    });

    auditLog(
      {
        author,
        userId: user.id,
        workspaceId: workspace.id,
        previousSeatType,
        newSeatType,
        scheduledAt: scheduledAt.toISOString(),
      },
      "Membership seat change scheduled"
    );
  }

  /**
   * Cancel a previously scheduled seat change. Reopens the current row
   * (clears its `endAt`) and removes the future row.
   */
  async cancelScheduledSeatChange({
    user,
    workspace,
    author,
  }: {
    user: UserResource;
    workspace: LightWorkspaceType;
    author: UserType | "no-author";
  }): Promise<void> {
    await frontSequelize.transaction(async (transaction) => {
      const futureRow = await MembershipModel.findOne({
        where: {
          userId: user.id,
          workspaceId: workspace.id,
          startAt: { [Op.gt]: new Date() },
        },
        transaction,
      });
      if (futureRow) {
        await futureRow.destroy({ transaction });
      }
      await this.update({ endAt: null }, transaction);
    });

    auditLog(
      {
        author,
        userId: user.id,
        workspaceId: workspace.id,
      },
      "Membership scheduled seat change cancelled"
    );
  }

  /**
   * Cancel scheduled seat changes for a whole workspace that were staged for a
   * specific `scheduledAt` moment (e.g. a pending contract switch's start). For
   * each future row at that exact moment, drops it and reopens the current row
   * it superseded (clears its `endAt`). Scoped to `scheduledAt` so unrelated
   * scheduled changes (e.g. an admin-deferred downgrade at period end) are left
   * untouched. Returns the number of memberships whose change was cancelled.
   */
  static async cancelScheduledSeatChangesForWorkspaceAt({
    workspace,
    scheduledAt,
  }: {
    workspace: LightWorkspaceType;
    scheduledAt: Date;
  }): Promise<number> {
    // A backdated/immediate remap updates the row in place (no future row), so
    // only a genuinely future `scheduledAt` can have rows to cancel.
    if (scheduledAt.getTime() <= Date.now()) {
      return 0;
    }
    return frontSequelize.transaction(async (transaction) => {
      const futureRows = await MembershipModel.findAll({
        where: {
          workspaceId: workspace.id,
          startAt: scheduledAt,
        },
        transaction,
      });
      for (const future of futureRows) {
        // Drop the future row first to preserve the `WHERE endAt IS NULL`
        // unique invariant, then reopen the current row it superseded.
        await future.destroy({ transaction });
        await MembershipModel.update(
          { endAt: null },
          {
            where: {
              userId: future.userId,
              workspaceId: workspace.id,
              endAt: scheduledAt,
            },
            transaction,
          }
        );
      }
      return futureRows.length;
    });
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction }
  ): Promise<Result<undefined, Error>> {
    const w = auth.workspace();
    const u = this.user;
    if (w && w.workOSOrganizationId && u && u.workOSUserId) {
      try {
        const workos = getWorkOS();

        const workOSMemberships =
          await workos.userManagement.listOrganizationMemberships({
            organizationId: w.workOSOrganizationId,
            userId: u.workOSUserId,
          });

        if (workOSMemberships.data.length > 0) {
          await workos.userManagement.deleteOrganizationMembership(
            workOSMemberships.data[0].id
          );
        }

        await invalidateWorkOSOrganizationsCacheForUserId(u.workOSUserId);
      } catch (error) {
        logger.error(
          {
            workspaceId: w.id,
            userId: u.id,
            error,
          },
          "Failed to delete WorkOS membership"
        );
      }
    }

    const [workspace] = await WorkspaceResource.fetchByModelIds([
      this.workspaceId,
    ]);

    await this.model.destroy({
      where: {
        id: this.id,
        workspaceId: this.workspaceId,
      },
      transaction,
    });

    const workspaceId = workspace?.sId;
    const userModelId = this.userId;
    const workspaceModelId = this.workspaceId;
    invalidateCacheAfterCommit(transaction, async () => {
      if (workspaceId) {
        await MembershipResource.invalidateActiveSeatsCache(workspaceId);
      }
      await MembershipResource.invalidateRoleCache({
        userModelId,
        workspaceModelId,
      });
    });

    return new Ok(undefined);
  }

  isRevoked(referenceDate: Date = new Date()): boolean {
    return !!this.endAt && this.endAt < referenceDate;
  }
}
