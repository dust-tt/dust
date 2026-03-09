import { Authenticator } from "@app/lib/auth";
import { MembershipInvitationModel } from "@app/lib/models/membership_invitation";
import { MembershipInvitationResource } from "@app/lib/resources/membership_invitation_resource";
import type { WorkspaceType } from "@app/types/user";
import { faker } from "@faker-js/faker";

export class MembershipInvitationFactory {
  static async create(
    workspace: WorkspaceType,
    overrides: {
      inviteEmail?: string;
      status?: "pending" | "consumed" | "revoked";
      initialRole?: "user" | "builder" | "admin";
      createdAt?: Date;
    } = {}
  ): Promise<MembershipInvitationResource> {
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const resource = await MembershipInvitationResource.makeNew(auth, {
      inviteEmail: overrides.inviteEmail ?? faker.internet.email(),
      status: overrides.status ?? "pending",
      initialRole: overrides.initialRole ?? "user",
    });

    // If a custom createdAt is needed (e.g. for expiration tests), update it
    // directly via the model since the Resource doesn't expose createdAt writes.
    if (overrides.createdAt) {
      await MembershipInvitationModel.update(
        { createdAt: overrides.createdAt },
        { where: { id: resource.id } }
      );
    }

    return resource;
  }
}
