import { verify } from "jsonwebtoken";
import type { Attributes, CreationAttributes, Transaction } from "sequelize";
import { Op } from "sequelize";

import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { INVITATION_EXPIRATION_TIME_SEC } from "@app/lib/constants/invitation";
import { AuthFlowError } from "@app/lib/iam/errors";
import { MembershipInvitationModel } from "@app/lib/models/membership_invitation";
import { BaseResource } from "@app/lib/resources/base_resource";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { UserResource } from "@app/lib/resources/user_resource";
import logger from "@app/logger/logger";
import type {
  ActiveRoleType,
  LightWorkspaceType,
  MembershipInvitationType,
  Result,
} from "@app/types";
import { Err, Ok } from "@app/types";

import { generateRandomModelSId } from "./string_ids";
import type { WorkspaceResource } from "./workspace_resource";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface MembershipInvitationResource
  extends ReadonlyAttributesType<MembershipInvitationModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class MembershipInvitationResource extends BaseResource<MembershipInvitationModel> {
  static model: ModelStaticWorkspaceAware<MembershipInvitationModel> =
    MembershipInvitationModel;

  static logger = logger.child({
    module: MembershipInvitationResource.constructor.name,
  });
  readonly workspace: WorkspaceModel;

  constructor(
    model: ModelStaticWorkspaceAware<MembershipInvitationModel>,
    blob: Attributes<MembershipInvitationModel>,
    { workspace }: { workspace: WorkspaceModel }
  ) {
    super(MembershipInvitationModel, blob);
    this.workspace = workspace;
  }

  static async makeNew(
    auth: Authenticator,
    blob: Omit<
      CreationAttributes<MembershipInvitationModel>,
      "sId" | "workspaceId"
    >,
    transaction?: Transaction
  ) {
    const invitation = await this.model.create(
      {
        ...blob,
        workspaceId: auth.getNonNullableWorkspace().id,
        sId: generateRandomModelSId(),
      },
      { transaction }
    );
    return new this(this.model, invitation.get(), {
      workspace: invitation.workspace,
    });
  }

  static async fetchById(
    auth: Authenticator,
    id: string
  ): Promise<MembershipInvitationResource | null> {
    const invitation = await this.model.findOne({
      where: {
        sId: id,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
    });
    return invitation
      ? new MembershipInvitationResource(this.model, invitation.get(), {
          workspace: invitation.workspace,
        })
      : null;
  }

  private static invitationExpired(createdAt: Date) {
    return (
      createdAt.getTime() + INVITATION_EXPIRATION_TIME_SEC * 1000 < Date.now()
    );
  }

  static async listRecentPendingAndRevokedInvitations(
    auth: Authenticator,
    transaction?: Transaction
  ): Promise<{
    pending: MembershipInvitationResource[];
    revoked: MembershipInvitationResource[];
  }> {
    const owner = auth.workspace();
    if (!owner) {
      return {
        pending: [],
        revoked: [],
      };
    }
    if (!auth.isAdmin()) {
      throw new Error(
        "Only users that are `admins` for the current workspace can see membership invitations or modify it."
      );
    }
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    const invitations = await this.model.findAll({
      where: {
        workspaceId: owner.id,
        status: ["pending", "revoked"],
        createdAt: {
          [Op.gt]: oneDayAgo,
        },
      },
      transaction,
    });

    const groupedInvitations: Record<
      "pending" | "revoked",
      MembershipInvitationResource[]
    > = {
      revoked: [],
      pending: [],
    };

    for (const i of invitations) {
      const status = i.status;
      if (status === "pending" || status === "revoked") {
        groupedInvitations[status].push(
          new MembershipInvitationResource(this.model, i.get(), {
            workspace: i.workspace,
          })
        );
      }
    }

    return groupedInvitations;
  }

  static async listPendingForEmail({
    email,
    includeExpired = false,
  }: {
    email: string;
    includeExpired?: boolean;
  }): Promise<MembershipInvitationResource[]> {
    const invitations = await this.model.findAll({
      where: {
        inviteEmail: email,
        status: "pending",
      },
      order: [["createdAt", "DESC"]],
      include: [WorkspaceModel],
      // WORKSPACE_ISOLATION_BYPASS: Invitations can span multiple workspaces prior to login.
      dangerouslyBypassWorkspaceIsolationSecurity: true,
    });

    return invitations
      .filter(
        (invitation) =>
          includeExpired || !this.invitationExpired(invitation.createdAt)
      )
      .map(
        (invitation) =>
          new MembershipInvitationResource(this.model, invitation.get(), {
            workspace: invitation.workspace,
          })
      );
  }

  static async getPendingForEmailAndWorkspace({
    email,
    workspace,
    includeExpired = false,
    transaction,
  }: {
    email: string;
    workspace: LightWorkspaceType | WorkspaceResource;
    includeExpired?: boolean;
    transaction?: Transaction;
  }): Promise<MembershipInvitationResource | null> {
    const invitation = await this.model.findOne({
      where: {
        inviteEmail: email,
        workspaceId: workspace.id,
        status: "pending",
      },
      include: [WorkspaceModel],
      transaction,
    });

    if (
      !invitation ||
      (!includeExpired && this.invitationExpired(invitation.createdAt))
    ) {
      return null;
    }

    return new MembershipInvitationResource(this.model, invitation.get(), {
      workspace: invitation.workspace,
    });
  }

  static async getPendingInvitations(
    auth: Authenticator,
    { includeExpired = false }: { includeExpired?: boolean } = {}
  ): Promise<MembershipInvitationResource[]> {
    const owner = auth.workspace();
    if (!owner) {
      return [];
    }
    if (!auth.isAdmin()) {
      throw new Error(
        "Only users that are `admins` for the current workspace can see membership invitations or modify it."
      );
    }

    const invitations = await this.model.findAll({
      where: {
        workspaceId: owner.id,
        status: "pending",
      },
    });

    return invitations
      .filter(
        (invitation) =>
          includeExpired || !this.invitationExpired(invitation.createdAt)
      )
      .map(
        (i) =>
          new MembershipInvitationResource(this.model, i.get(), {
            workspace: i.workspace,
          })
      );
  }

  static async getPendingForToken(
    inviteToken: string | string[] | undefined
  ): Promise<Result<MembershipInvitationResource | null, AuthFlowError>> {
    if (inviteToken && typeof inviteToken === "string") {
      let decodedToken: { membershipInvitationId: number } | null = null;
      try {
        decodedToken = verify(
          inviteToken,
          config.getDustInviteTokenSecret()
        ) as {
          membershipInvitationId: number;
        };
      } catch (e) {
        // Log the error and continue as we test `deodedToken` is not null below.
        this.logger.error(
          {
            error: e,
          },
          "Error while verifying invite token"
        );
      }
      if (!decodedToken) {
        return new Err(
          new AuthFlowError(
            "invalid_invitation_token",
            "The invite token is invalid, please ask your admin to resend an invitation."
          )
        );
      }

      const membershipInvite = await this.model.findOne({
        where: {
          id: decodedToken.membershipInvitationId,
          status: "pending",
        },
        include: [WorkspaceModel],
        // WORKSPACE_ISOLATION_BYPASS: We don't know the workspace yet, the user is not authed
        dangerouslyBypassWorkspaceIsolationSecurity: true,
      });
      if (!membershipInvite) {
        return new Err(
          new AuthFlowError(
            "invalid_invitation_token",
            "The invite token is invalid, please ask your admin to resend an invitation."
          )
        );
      }

      if (this.invitationExpired(membershipInvite.createdAt)) {
        return new Err(
          new AuthFlowError(
            "expired_invitation",
            "The invitation has expired, please ask your admin to resend it."
          )
        );
      }

      return new Ok(
        new MembershipInvitationResource(this.model, membershipInvite.get(), {
          workspace: membershipInvite.workspace,
        })
      );
    }

    return new Ok(null);
  }

  isExpired() {
    return (
      this.createdAt.getTime() + INVITATION_EXPIRATION_TIME_SEC * 1000 <
      Date.now()
    );
  }

  async markAsConsumed(user: UserResource) {
    return this.update({
      status: "consumed",
      invitedUserId: user.id,
    });
  }

  async revoke(transaction?: Transaction) {
    return this.update(
      {
        status: "revoked",
      },
      transaction
    );
  }

  async updateRole(role: ActiveRoleType, transaction?: Transaction) {
    return this.update(
      {
        initialRole: role,
      },
      transaction
    );
  }

  async updateStatus(
    status: "pending" | "consumed" | "revoked",
    transaction?: Transaction
  ) {
    return this.update(
      {
        status,
      },
      transaction
    );
  }

  delete(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    auth: Authenticator,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    { transaction }: { transaction?: Transaction | undefined }
  ): Promise<Result<number | undefined, Error>> {
    throw new Error("Method not implemented.");
  }

  toJSON(): MembershipInvitationType {
    return {
      createdAt: this.createdAt.getTime(),
      id: this.id,
      initialRole: this.initialRole,
      inviteEmail: this.inviteEmail,
      sId: this.sId,
      status: this.status,
      isExpired: this.isExpired(),
    };
  }
}
