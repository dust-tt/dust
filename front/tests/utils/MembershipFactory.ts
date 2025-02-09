import type { MembershipRoleType, WorkspaceType } from "@dust-tt/types";

import { MembershipResource } from "@app/lib/resources/membership_resource";
import type { UserResource } from "@app/lib/resources/user_resource";

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
