import type { MembershipRoleType } from "@dust-tt/types";

import type { Workspace } from "@app/lib/models/workspace";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";

export class MembershipFactory {
  static async associate(
    workspace: Workspace,
    user: UserResource,
    role: MembershipRoleType
  ) {
    return MembershipResource.createMembership({
      workspace: renderLightWorkspaceType({ workspace }),
      user,
      role,
    });
  }
}
