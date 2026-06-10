import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import { MembershipUpgradeRequestModel } from "@app/lib/resources/storage/models/membership_upgrade_requests";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { getResourceIdFromSId, makeSId } from "@app/lib/resources/string_ids";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import { UserResource } from "@app/lib/resources/user_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
import type {
  MembershipUpgradeRequestStatus,
  MembershipUpgradeRequestType,
} from "@app/types/memberships";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { Attributes, ModelStatic, Transaction } from "sequelize";

export interface MembershipUpgradeRequestResource
  extends ReadonlyAttributesType<MembershipUpgradeRequestModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class MembershipUpgradeRequestResource extends BaseResource<MembershipUpgradeRequestModel> {
  static model: ModelStaticWorkspaceAware<MembershipUpgradeRequestModel> =
    MembershipUpgradeRequestModel;

  readonly requester: UserResource;

  constructor(
    _: ModelStatic<MembershipUpgradeRequestModel>,
    blob: Attributes<MembershipUpgradeRequestModel>,
    { requester }: { requester: UserResource }
  ) {
    super(MembershipUpgradeRequestModel, blob);
    this.requester = requester;
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
    { user }: { user: UserResource }
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
        },
        { transaction }
      );
    });
    return new Ok(new this(this.model, row.get(), { requester: user }));
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

    return rows.flatMap((r) => {
      const requester = requesterByModelId.get(r.userId);
      if (!requester) {
        return [];
      }
      return [new this(this.model, r.get(), { requester })];
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
    if (!auth.isAdmin()) {
      return [];
    }
    return this.baseFetch(auth, {
      where: { status: "pending" },
      order: [["createdAt", "DESC"]],
    });
  }

  // Fetching an arbitrary request by id is an admin-only operation (the admin
  // resolves it).
  static async fetchById(
    auth: Authenticator,
    membershipUpgradeRequestId: string
  ): Promise<MembershipUpgradeRequestResource | null> {
    if (!auth.isAdmin()) {
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
      requester: {
        sId: this.requester.sId,
        name: this.requester.fullName() || this.requester.name,
        email: this.requester.email ?? null,
        image: this.requester.imageUrl ?? null,
      },
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
