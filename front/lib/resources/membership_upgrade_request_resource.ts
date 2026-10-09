import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { MemberVerbAuthority } from "@app/lib/resources/group_management_access";
import {
  getMemberScopeWithGroupVerb,
  getMemberVerbAuthority,
} from "@app/lib/resources/group_management_access";
import { GroupResource } from "@app/lib/resources/group_resource";
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
  MembershipUpgradeRequestCause,
  MembershipUpgradeRequestStatus,
  MembershipUpgradeRequestType,
} from "@app/types/memberships";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { Attributes, ModelStatic, Transaction } from "sequelize";
import { UniqueConstraintError } from "sequelize";

export interface MembershipUpgradeRequestResource extends ReadonlyAttributesType<MembershipUpgradeRequestModel> {}

export class UpgradeRequestReasonRequiredError extends Error {}

export class MembershipUpgradeRequestResource extends BaseResource<MembershipUpgradeRequestModel> {
  static model: ModelStaticWorkspaceAware<MembershipUpgradeRequestModel> =
    MembershipUpgradeRequestModel;

  readonly requester: UserResource;
  readonly requesterSeatType: MembershipSeatType | null;

  constructor(
    _: ModelStatic<MembershipUpgradeRequestModel>,
    blob: Attributes<MembershipUpgradeRequestModel>,
    {
      requester,
      requesterSeatType,
    }: {
      requester: UserResource;
      requesterSeatType: MembershipSeatType | null;
    }
  ) {
    super(MembershipUpgradeRequestModel, blob);
    this.requester = requester;
    this.requesterSeatType = requesterSeatType;
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
  // pending one if there already is one.
  static async createPending(
    auth: Authenticator,
    {
      user,
      reason,
      reasonRequired,
      cause,
    }: {
      user: UserResource;
      reason: string | null;
      reasonRequired: boolean;
      cause: MembershipUpgradeRequestCause;
    }
  ): Promise<Result<MembershipUpgradeRequestResource, Error>> {
    const workspace = auth.getNonNullableWorkspace();
    let row;
    try {
      row = await withTransaction(async (transaction) => {
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
        if (reasonRequired && !reason?.trim()) {
          throw new UpgradeRequestReasonRequiredError(
            "A reason is required to submit an upgrade request."
          );
        }
        return this.model.create(
          {
            workspaceId: workspace.id,
            userId: user.id,
            status: "pending",
            reason,
            cause,
          },
          { transaction }
        );
      });
    } catch (err) {
      if (err instanceof UpgradeRequestReasonRequiredError) {
        return new Err(err);
      }
      if (err instanceof UniqueConstraintError) {
        // Lost the race on the partial unique index: another request
        // created the pending row between our `findOne` and `create`.
        // Reuse it so `createPending` stays idempotent under concurrency.
        const existing = await this.model.findOne({
          where: {
            workspaceId: workspace.id,
            userId: user.id,
            status: "pending",
          },
        });
        if (!existing) {
          return new Err(normalizeError(err));
        }
        row = existing;
      } else {
        return new Err(normalizeError(err));
      }
    }
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

  /**
   * @cc [owner:philipperolet,label:security] pending-request-scope
   * Delegates MUST receive only requests from current members covered by `set_usage_limits`.
   * Group filters MUST narrow that scope; overlapping groups MUST NOT duplicate requests.
   */
  static async listPendingByWorkspace(
    auth: Authenticator,
    { groupId }: { groupId?: string } = {}
  ): Promise<MembershipUpgradeRequestResource[]> {
    const scope = await getMemberScopeWithGroupVerb(auth, "set_usage_limits");
    let memberModelIds =
      scope.kind === "ids" ? scope.memberModelIds : undefined;
    if (groupId) {
      const group = await GroupResource.fetchById(auth, groupId);
      if (group.isErr()) {
        return [];
      }
      const members = await group.value.getActiveMembers(auth);
      const groupMemberModelIds = new Set(members.map((member) => member.id));
      memberModelIds = memberModelIds
        ? memberModelIds.filter((id) => groupMemberModelIds.has(id))
        : [...groupMemberModelIds];
    }
    if (memberModelIds?.length === 0) {
      return [];
    }
    // The workspace/status and pending workspace/user indexes cover both paths.
    return this.baseFetch(auth, {
      where: {
        status: "pending",
        ...(memberModelIds ? { userId: memberModelIds } : {}),
      },
      order: [["createdAt", "DESC"]],
    });
  }

  // Fetch requests only when the caller can manage the requester's limit.
  static async fetchById(
    auth: Authenticator,
    membershipUpgradeRequestId: string
  ): Promise<MembershipUpgradeRequestResource | null> {
    const modelId = getResourceIdFromSId(membershipUpgradeRequestId);
    if (!modelId) {
      return null;
    }
    const [request] = await this.baseFetch(auth, { where: { id: modelId } });
    if (
      !request ||
      (await request.getResolutionAuthority(auth)).kind === "none"
    ) {
      return null;
    }
    return request;
  }

  private async getResolutionAuthority(
    auth: Authenticator
  ): Promise<MemberVerbAuthority> {
    const workspace = auth.getNonNullableWorkspace();
    if (this.workspaceId !== workspace.id) {
      return { kind: "none" };
    }
    // Workspace managers can still clear requests after the requester leaves the workspace.
    if (auth.isManager()) {
      return { kind: "workspace" };
    }
    return getMemberVerbAuthority(auth, this.requester, "set_usage_limits");
  }

  /**
   * @cc [owner:philipperolet,label:security;concurrency] request-resolution-authority
   * Delegated resolution MUST recheck the requester's current workspace and group membership.
   * Workspace managers may also resolve former members' requests. Only pending requests in the
   * caller's workspace may change, and concurrent resolutions MUST have only one winner.
   */
  async markAsResolved(
    auth: Authenticator,
    {
      status,
    }: {
      status: Exclude<MembershipUpgradeRequestStatus, "pending">;
    },
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<
    Result<MemberVerbAuthority, "unauthorized" | "request_not_pending">
  > {
    const authority = await this.getResolutionAuthority(auth);
    if (authority.kind === "none") {
      return new Err("unauthorized");
    }
    const [updated] = await this.update(
      {
        status,
        resolvedByUserId: auth.getNonNullableUser().id,
        resolvedAt: new Date(),
      },
      transaction,
      { workspaceId: auth.getNonNullableWorkspace().id, status: "pending" }
    );
    if (updated === 0) {
      return new Err("request_not_pending");
    }
    return new Ok(authority);
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
      cause: this.cause,
      requester: {
        sId: this.requester.sId,
        name: this.requester.fullName() || this.requester.name,
        email: this.requester.email ?? null,
        image: this.requester.imageUrl ?? null,
        seatType: this.requesterSeatType,
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
