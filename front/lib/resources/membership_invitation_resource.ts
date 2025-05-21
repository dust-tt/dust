// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.

import type { Attributes, Transaction } from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { MembershipInvitationModel } from "@app/lib/models/membership_invitation";
import { Workspace } from "@app/lib/models/workspace";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { Result, WorkspaceType } from "@app/types";

import { renderLightWorkspaceType } from "../workspace";

// eslint-disable-next-line @typescript-eslint/no-empty-interface, @typescript-eslint/no-unsafe-declaration-merging
export interface MembershipInvitationResource
  extends ReadonlyAttributesType<MembershipInvitationModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class MembershipInvitationResource extends BaseResource<MembershipInvitationModel> {
  static model: ModelStaticWorkspaceAware<MembershipInvitationModel> =
    MembershipInvitationModel;

  readonly workspace: WorkspaceType;

  constructor(
    model: ModelStaticWorkspaceAware<MembershipInvitationModel>,
    blob: Attributes<MembershipInvitationModel>,
    { workspace }: { workspace: Workspace }
  ) {
    super(MembershipInvitationModel, blob);
    this.workspace = renderLightWorkspaceType({ workspace });
  }

  static async getPendingForEmail(
    email: string
  ): Promise<MembershipInvitationResource | null> {
    const pendingInvitation = await MembershipInvitationModel.findOne({
      where: {
        inviteEmail: email,
        status: "pending",
      },
      include: [Workspace],
    });

    return pendingInvitation
      ? new MembershipInvitationResource(this.model, pendingInvitation.get(), {
          workspace: pendingInvitation.workspace,
        })
      : null;
  }

  delete(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    auth: Authenticator,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    { transaction }: { transaction?: Transaction | undefined }
  ): Promise<Result<number | undefined, Error>> {
    throw new Error("Method not implemented.");
  }

  toJSON() {
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
