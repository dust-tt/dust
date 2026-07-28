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
    {
      user,
      reason,
      requestedDurationDays,
    }: {
      user: UserResource;
      reason: string | null;
      requestedDurationDays: number | null;
    }
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
          requestedDurationDays,
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

  // Admin history: most recently resolved requests (approved or denied),
  // newest first. Bounded rather than paginated — a first cut for the
  // history view; revisit with cursor pagination if workspaces need to see
  // further back than `limit`.
  static async listResolvedByWorkspace(
    auth: Authenticator,
    { limit }: { limit: number }
  ): Promise<MembershipUpgradeRequestResource[]> {
    if (!auth.isManager()) {
      return [];
    }
    return this.baseFetch(auth, {
      where: { status: { [Op.ne]: "pending" } },
      order: [["resolvedAt", "DESC"]],
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

  // Mark the request as resolved by an admin. Only a `pending` request can be
  // resolved; resolving an already-resolved request is rejected.
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
    if (this.status !== "pending") {
      return new Err(new Error("Request is not pending."));
    }
    await this.update(
      {
        status,
        resolvedByUserId: resolvedByUser.id,
        resolvedAt: new Date(),
      },
      transaction
    );
    return new Ok(undefined);
  }

  // Snapshot the spend-limit override actually granted when this (approved)
  // request was resolved via the linked "Edit limit" flow. Called from
  // `setUserSpendLimit` right after the override is persisted — see
  // `expireActiveGrantsForUser` for how this grant later gets closed out.
  async recordGrant(
    { awuCredits, expiresAt }: { awuCredits: number; expiresAt: Date | null },
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<void> {
    await this.update(
      {
        grantedAwuCredits: awuCredits,
        grantedExpiresAt: expiresAt,
        expiredAt: null,
      },
      transaction
    );
  }

  // Close out any grant(s) still tracked as active for `user` — stamps
  // `expiredAt` on every request row with a recorded grant that hasn't
  // already been closed. Called both by the expiration sweep (the grant
  // naturally lapsed) and by `setUserSpendLimit` before applying *any* new
  // override for this user (a manual change supersedes it early, whether or
  // not the new value is itself request-linked). Because the override is a
  // single overwritable slot per membership, at most one row is normally
  // still open, but this closes all of them defensively.
  static async expireActiveGrantsForUser(
    auth: Authenticator,
    { user }: { user: UserResource },
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<void> {
    await this.model.update(
      { expiredAt: new Date() },
      {
        where: {
          workspaceId: auth.getNonNullableWorkspace().id,
          userId: user.id,
          grantedAwuCredits: { [Op.ne]: null },
          expiredAt: null,
        },
        transaction,
      }
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
      requestedDurationDays: this.requestedDurationDays,
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
          }
        : null,
      grantedAwuCredits: this.grantedAwuCredits,
      grantedExpiresAt: this.grantedExpiresAt
        ? this.grantedExpiresAt.getTime()
        : null,
      expiredAt: this.expiredAt ? this.expiredAt.getTime() : null,
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
