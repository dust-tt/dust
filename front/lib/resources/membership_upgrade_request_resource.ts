import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import { MembershipUpgradeRequestModel } from "@app/lib/resources/storage/models/membership_upgrade_requests";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { getResourceIdFromSId, makeSId } from "@app/lib/resources/string_ids";
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

type RequesterInfo = {
  sId: string;
  name: string;
  email: string | null;
  image: string | null;
};

function serializeRequester(user: UserResource): RequesterInfo {
  return {
    sId: user.sId,
    name: user.fullName() || user.name,
    email: user.email ?? null,
    image: user.imageUrl ?? null,
  };
}

export interface MembershipUpgradeRequestResource
  extends ReadonlyAttributesType<MembershipUpgradeRequestModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class MembershipUpgradeRequestResource extends BaseResource<MembershipUpgradeRequestModel> {
  static model: ModelStaticWorkspaceAware<MembershipUpgradeRequestModel> =
    MembershipUpgradeRequestModel;

  readonly requester: RequesterInfo;

  constructor(
    _: ModelStatic<MembershipUpgradeRequestModel>,
    blob: Attributes<MembershipUpgradeRequestModel>,
    { requester }: { requester: RequesterInfo }
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
    const requester = serializeRequester(user);
    try {
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
      return new Ok(new this(this.model, row.get(), { requester }));
    } catch (err) {
      return new Err(normalizeError(err));
    }
  }

  static async getPendingForUser(
    auth: Authenticator,
    { user }: { user: UserResource }
  ): Promise<MembershipUpgradeRequestResource | null> {
    const workspace = auth.getNonNullableWorkspace();
    const row = await this.model.findOne({
      where: {
        workspaceId: workspace.id,
        userId: user.id,
        status: "pending",
      },
    });
    if (!row) {
      return null;
    }
    return new this(this.model, row.get(), {
      requester: serializeRequester(user),
    });
  }

  static async listPendingByWorkspace(
    auth: Authenticator
  ): Promise<MembershipUpgradeRequestResource[]> {
    const workspace = auth.getNonNullableWorkspace();
    const rows = await this.model.findAll({
      where: { workspaceId: workspace.id, status: "pending" },
      order: [["createdAt", "DESC"]],
    });
    if (rows.length === 0) {
      return [];
    }

    const requesters = await UserResource.fetchByModelIds(
      rows.map((r) => r.userId)
    );
    const requesterByModelId = new Map(requesters.map((u) => [u.id, u]));

    return rows.flatMap((r) => {
      const user = requesterByModelId.get(r.userId);
      if (!user) {
        return [];
      }
      return [
        new this(this.model, r.get(), { requester: serializeRequester(user) }),
      ];
    });
  }

  static async fetchById(
    auth: Authenticator,
    requestId: string
  ): Promise<MembershipUpgradeRequestResource | null> {
    const workspace = auth.getNonNullableWorkspace();
    const id = getResourceIdFromSId(requestId);
    if (!id) {
      return null;
    }
    const row = await this.model.findOne({
      where: { id, workspaceId: workspace.id },
    });
    if (!row) {
      return null;
    }
    const user = await UserResource.fetchByModelId(row.userId);
    if (!user) {
      return null;
    }
    return new this(this.model, row.get(), {
      requester: serializeRequester(user),
    });
  }

  // Mark the request as resolved by an admin. Only a `pending` request can be
  // resolved; resolving an already-resolved request is rejected.
  async resolve(
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
    try {
      await this.update(
        {
          status,
          resolvedByUserId: resolvedByUser.id,
          resolvedAt: new Date(),
        },
        transaction
      );
      return new Ok(undefined);
    } catch (err) {
      return new Err(normalizeError(err));
    }
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
      requester: this.requester,
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
