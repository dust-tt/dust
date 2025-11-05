import { verify } from "jsonwebtoken";
import type { Attributes, Transaction } from "sequelize";

import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { AuthFlowError } from "@app/lib/iam/errors";
import { MembershipInvitationModel } from "@app/lib/models/membership_invitation";
import { BaseResource } from "@app/lib/resources/base_resource";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { UserResource } from "@app/lib/resources/user_resource";
import logger from "@app/logger/logger";
import type { MembershipInvitationType, Result } from "@app/types";
import { Err, Ok } from "@app/types";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface, @typescript-eslint/no-unsafe-declaration-merging
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

  static async getPendingForEmail(
    email: string
  ): Promise<MembershipInvitationResource | null> {
    const pendingInvitation = await this.model.findOne({
      where: {
        inviteEmail: email,
        status: "pending",
      },
      include: [WorkspaceModel],
      // Order by createdAt to ensure consistent behavior - oldest invitation first
      order: [["createdAt", "ASC"]],
      // WORKSPACE_ISOLATION_BYPASS: We don't know the workspace yet, the user is not authed
      dangerouslyBypassWorkspaceIsolationSecurity: true,
    });

    return pendingInvitation
      ? new MembershipInvitationResource(this.model, pendingInvitation.get(), {
          workspace: pendingInvitation.workspace,
        })
      : null;
  }

  static async getPendingForEmailAndWorkspace(
    email: string,
    workspaceId: number
  ): Promise<MembershipInvitationResource | null> {
    const invitation = await this.model.findOne({
      where: {
        inviteEmail: email,
        workspaceId,
        status: "pending",
      },
      include: [WorkspaceModel],
    });

    return invitation
      ? new MembershipInvitationResource(this.model, invitation.get(), {
          workspace: invitation.workspace,
        })
      : null;
  }

  static async getAllPendingForEmail(
    email: string
  ): Promise<MembershipInvitationResource[]> {
    const invitations = await this.model.findAll({
      where: {
        inviteEmail: email,
        status: "pending",
      },
      include: [WorkspaceModel],
      order: [["createdAt", "ASC"]],
      // WORKSPACE_ISOLATION_BYPASS: We don't know the workspace yet, the user is not authed
      dangerouslyBypassWorkspaceIsolationSecurity: true,
    });

    return invitations.map(
      (invitation) =>
        new MembershipInvitationResource(this.model, invitation.get(), {
          workspace: invitation.workspace,
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

      return new Ok(
        new MembershipInvitationResource(this.model, membershipInvite.get(), {
          workspace: membershipInvite.workspace,
        })
      );
    }

    return new Ok(null);
  }

  async markAsConsumed(user: UserResource) {
    return this.update({
      status: "consumed",
      invitedUserId: user.id,
    });
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
    };
  }
}
