import { MembershipResource } from "@app/lib/resources/membership_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import type { MembershipRoleType, WorkspaceType } from "@app/types";

export class MembershipFactory {
  static async associate(
    workspace: WorkspaceType,
    user: UserResource,
    role: MembershipRoleType
  ) {
    return MembershipResource.createMembership({
      workspace,
      user,
      role,
    });
  }
}
