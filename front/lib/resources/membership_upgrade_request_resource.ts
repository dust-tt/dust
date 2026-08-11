import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { MembershipUpgradeRequestModel } from "@app/lib/resources/storage/models/membership_upgrade_requests";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { getResourceIdFromSId, makeSId } from "@app/lib/resources/string_ids";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import { UserResource } from "@app/lib/resources/user_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
import type { SpendLimitExpiryKind } from "@app/types/api/users/spend_limit";
import type {
  MembershipSeatType,
  MembershipUpgradeRequestStatus,
  MembershipUpgradeRequestType,
} from "@app/types/memberships";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { Attributes, ModelStatic, Transaction } from "sequelize";
import { Op } from "sequelize";

export interface MembershipUpgradeRequestResource
  extends ReadonlyAttributesType<MembershipUpgradeRequestModel> {}

type GrantSnapshot = Pick<
  Attributes<MembershipUpgradeRequestModel>,
  | "grantedAwuCredits"
  | "grantedExpiryKind"
  | "grantedUnlimitedSpend"
  | "grantedSeatType"
>;

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class MembershipUpgradeRequestResource extends BaseResource<MembershipUpgradeRequestModel> {
  static model: ModelStaticWorkspaceAware<MembershipUpgradeRequestModel> =
    MembershipUpgradeRequestModel;

  readonly requester: UserResource;
  readonly requesterSeatType: MembershipSeatType | null;
  readonly resolvedByUser: UserResource | null;

  constructor(
    _: ModelStatic<MembershipUpgradeRequestModel>,
    blob: Attributes<MembershipUpgradeRequestModel>,
    {
      requester,
      requesterSeatType,
      resolvedByUser,
    }: {
      requester: UserResource;
      requesterSeatType: MembershipSeatType | null;
      resolvedByUser?: UserResource | null;
    }
  ) {
    super(MembershipUpgradeRequestModel, blob);
    this.requester = requester;
    this.requesterSeatType = requesterSeatType;
    this.resolvedByUser = resolvedByUser ?? null;
  }

  get sId(): string {
    return MembershipUpgradeRequestResource.modelIdToSId({
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
    return makeSId("membership_upgrade_request", { id, workspaceId });
  }

  // Create a pending request for the given member, or return the existing
  // pending one if there already is one (idempotent — requesting again while a
  // request is pending is a no-op). The partial unique index also guards
  // against concurrent duplicates.
  static async createPending(
    auth: Authenticator,
    { user, reason }: { user: UserResource; reason: string | null }
  ): Promise<Result<MembershipUpgradeRequestResource, Error>> {
    const workspace = auth.getNonNullableWorkspace();
    const row = await withTransaction(async (transaction) => {
      const existing = await this.model.findOne({
        where: {
          workspaceId: workspace.id,
          userId: user.id,
          status: "pending",
        },
        transaction,
      });
      if (existing) {
        return existing;
      }
      return this.model.create(
        {
          workspaceId: workspace.id,
          userId: user.id,
          status: "pending",
          reason,
        },
        { transaction }
      );
    });
    const membership =
      await MembershipResource.getActiveMembershipOfUserInWorkspace({
        user,
        workspace,
      });
    return new Ok(
      new this(this.model, row.get(), {
        requester: user,
        requesterSeatType: membership?.seatType ?? null,
      })
    );
  }

  private static async baseFetch(
    auth: Authenticator,
    options?: ResourceFindOptions<MembershipUpgradeRequestModel>
  ): Promise<MembershipUpgradeRequestResource[]> {
    const { where, ...otherOptions } = options ?? {};

    const rows = await this.model.findAll({
      where: {
        ...where,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      ...otherOptions,
    });
    if (rows.length === 0) {
      return [];
    }

    const requesters = await UserResource.fetchByModelIds(
      rows.map((r) => r.userId)
    );
    const requesterByModelId = new Map(requesters.map((u) => [u.id, u]));

    const resolvedByUserModelIds = rows.flatMap((r) =>
      r.resolvedByUserId !== null ? [r.resolvedByUserId] : []
    );
    const resolvedByUsers =
      resolvedByUserModelIds.length > 0
        ? await UserResource.fetchByModelIds(resolvedByUserModelIds)
        : [];
    const resolvedByUserByModelId = new Map(
      resolvedByUsers.map((u) => [u.id, u])
    );

    const { memberships } = await MembershipResource.getActiveMemberships({
      users: requesters,
      workspace: auth.getNonNullableWorkspace(),
    });
    const seatTypeByUserModelId = new Map(
      memberships.map((m) => [m.userId, m.seatType])
    );

    return rows.flatMap((r) => {
      const requester = requesterByModelId.get(r.userId);
      if (!requester) {
        return [];
      }
      return [
        new this(this.model, r.get(), {
          requester,
          requesterSeatType: seatTypeByUserModelId.get(r.userId) ?? null,
          resolvedByUser:
            r.resolvedByUserId !== null
              ? (resolvedByUserByModelId.get(r.resolvedByUserId) ?? null)
              : null,
        }),
      ];
    });
  }

  static async getPendingForUser(
    auth: Authenticator,
    { user }: { user: UserResource }
  ): Promise<MembershipUpgradeRequestResource | null> {
    const [request] = await this.baseFetch(auth, {
      where: { userId: user.id, status: "pending" },
    });
    return request ?? null;
  }

  static async listPendingByWorkspace(
    auth: Authenticator
  ): Promise<MembershipUpgradeRequestResource[]> {
    if (!auth.isManager()) {
      return [];
    }
    return this.baseFetch(auth, {
      where: { status: "pending" },
      order: [["createdAt", "DESC"]],
    });
  }

  // Resolved requests, most recent first
  static async listResolvedByWorkspace(
    auth: Authenticator,
    { limit, offset }: { limit: number; offset: number }
  ): Promise<{ requests: MembershipUpgradeRequestResource[]; total: number }> {
    if (!auth.isManager()) {
      return { requests: [], total: 0 };
    }
    const where = { status: { [Op.ne]: "pending" } };
    const requests = await this.baseFetch(auth, {
      where,
      // `id` breaks ties between requests resolved at the same timestamp, so
      // offset pagination stays stable across pages.
      order: [
        ["resolvedAt", "DESC"],
        ["id", "DESC"],
      ],
      limit,
      offset,
    });

    const total = await this.model.count({
      where: { ...where, workspaceId: auth.getNonNullableWorkspace().id },
    });
    return { requests, total };
  }

  // Resolved requests, most recent first, keyset-paginated on
  // (resolvedAt, id) rather than offset. Offset pagination would shift
  // under a concurrent resolution (a newly resolved request is inserted at
  // the head, pushing every offset down), causing the caller to duplicate
  // or skip rows across pages; keyset pagination is immune to that because
  // each page is bounded by the last row actually returned.
  static async listResolvedByWorkspaceAfter(
    auth: Authenticator,
    {
      limit,
      after,
    }: { limit: number; after: { resolvedAt: Date; id: ModelId } | null }
  ): Promise<MembershipUpgradeRequestResource[]> {
    if (!auth.isManager()) {
      return [];
    }
    const statusFilter = { status: { [Op.ne]: "pending" } } as const;
    const where = after
      ? {
          ...statusFilter,
          [Op.or]: [
            { resolvedAt: { [Op.lt]: after.resolvedAt } },
            { resolvedAt: after.resolvedAt, id: { [Op.lt]: after.id } },
          ],
        }
      : statusFilter;

    return this.baseFetch(auth, {
      where,
      order: [
        ["resolvedAt", "DESC"],
        ["id", "DESC"],
      ],
      limit,
    });
  }

  // Fetching an arbitrary request by id is a business-admin operation (a
  // manager or full admin resolves it from the usage page).
  static async fetchById(
    auth: Authenticator,
    membershipUpgradeRequestId: string
  ): Promise<MembershipUpgradeRequestResource | null> {
    if (!auth.isManager()) {
      return null;
    }
    const modelId = getResourceIdFromSId(membershipUpgradeRequestId);
    if (!modelId) {
      return null;
    }
    const [request] = await this.baseFetch(auth, { where: { id: modelId } });
    return request ?? null;
  }

  // Mark the request as resolved by an admin. This is a compare-and-set on
  // `status = 'pending'` (not a plain update-by-id) so that two admins
  // resolving the same request concurrently can't both succeed: only the
  // update that observes `pending` at the DB level wins, the other gets back
  // an error instead of silently overwriting the first resolution.
  async markAsResolved(
    auth: Authenticator,
    {
      status,
      resolvedByUser,
    }: {
      status: Exclude<MembershipUpgradeRequestStatus, "pending">;
      resolvedByUser: UserResource;
    },
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<undefined, Error>> {
    const [affectedCount, affectedRows] =
      await MembershipUpgradeRequestModel.update(
        {
          status,
          resolvedByUserId: resolvedByUser.id,
          resolvedAt: new Date(),
        },
        {
          where: { id: this.id, status: "pending" },
          transaction,
          returning: true,
        }
      );
    if (affectedCount === 0) {
      return new Err(new Error("Request is not pending."));
    }
    Object.assign(this, affectedRows[0].get());
    return new Ok(undefined);
  }

  // Snapshot of the currently-recorded grant, so a failed downstream sync can
  // restore it exactly (mirrors `MembershipResource.poolCapOverrideSnapshot`).
  get grantSnapshot(): GrantSnapshot {
    return {
      grantedAwuCredits: this.grantedAwuCredits,
      grantedExpiryKind: this.grantedExpiryKind,
      grantedUnlimitedSpend: this.grantedUnlimitedSpend,
      grantedSeatType: this.grantedSeatType,
    };
  }

  // Restore a grant from a snapshot. Used when a resolution's downstream
  // effect (e.g. syncing the approved spend limit to Metronome) fails after
  // the grant was already recorded, so the request doesn't claim a grant that
  // was never actually applied.
  async revertGrant(
    snapshot: GrantSnapshot,
    transaction?: Transaction
  ): Promise<void> {
    await this.update(snapshot, transaction);
  }

  // Snapshot the spend-limit override actually granted when this (approved)
  // request was resolved
  async recordGrant(
    limit:
      | { kind: "unlimited" }
      | {
          kind: "limited";
          awuCredits: number;
          expiryKind?: SpendLimitExpiryKind | null;
        },
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<void> {
    await this.update(
      {
        grantedAwuCredits: limit.kind === "limited" ? limit.awuCredits : null,
        grantedExpiryKind:
          limit.kind === "limited" ? (limit.expiryKind ?? null) : null,
        grantedUnlimitedSpend: limit.kind === "unlimited",
        grantedSeatType: null,
      },
      transaction
    );
  }

  // Revert a resolution back to `pending` after a downstream side effect
  // applied while claiming this request (e.g. the linked spend-limit sync)
  // failed.
  async revertToPending(transaction?: Transaction): Promise<void> {
    await this.update(
      { status: "pending", resolvedByUserId: null, resolvedAt: null },
      transaction
    );
  }

  // Snapshot the seat this (approved) request was resolved to
  async recordSeatUpgrade(
    seatType: MembershipSeatType,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<void> {
    await this.update(
      {
        grantedSeatType: seatType,
        grantedAwuCredits: null,
        grantedExpiryKind: null,
        grantedUnlimitedSpend: false,
      },
      transaction
    );
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<undefined, Error>> {
    try {
      await MembershipUpgradeRequestModel.destroy({
        where: { id: this.id, workspaceId: auth.getNonNullableWorkspace().id },
        transaction,
      });
      return new Ok(undefined);
    } catch (err) {
      return new Err(normalizeError(err));
    }
  }

  // Delete all rows for a workspace. Called during workspace deletion/scrubbing
  // to satisfy the `ON DELETE RESTRICT` FK before the workspace row is removed.
  static async deleteAllForWorkspace(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<void> {
    await this.model.destroy({
      where: { workspaceId: auth.getNonNullableWorkspace().id },
      transaction,
    });
  }

  toJSON(): MembershipUpgradeRequestType {
    return {
      sId: this.sId,
      status: this.status,
      createdAt: this.createdAt.getTime(),
      resolvedAt: this.resolvedAt ? this.resolvedAt.getTime() : null,
      reason: this.reason,
      requester: {
        sId: this.requester.sId,
        name: this.requester.fullName() || this.requester.name,
        email: this.requester.email ?? null,
        image: this.requester.imageUrl ?? null,
        seatType: this.requesterSeatType,
      },
      resolvedBy: this.resolvedByUser
        ? {
            sId: this.resolvedByUser.sId,
            name: this.resolvedByUser.fullName() || this.resolvedByUser.name,
            image: this.resolvedByUser.imageUrl ?? null,
          }
        : null,
      grantedAwuCredits: this.grantedAwuCredits,
      grantedExpiryKind: this.grantedExpiryKind,
      grantedUnlimitedSpend: this.grantedUnlimitedSpend,
      grantedSeatType: this.grantedSeatType,
    };
  }

  toLogJSON() {
    return {
      id: this.id,
      sId: this.sId,
      workspaceId: this.workspaceId,
      status: this.status,
    };
  }
}
