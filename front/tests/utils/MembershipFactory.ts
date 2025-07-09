import type { Transaction } from "sequelize";

import { MembershipResource } from "@app/lib/resources/membership_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import type {
  MembershipOriginType,
  MembershipRoleType,
  WorkspaceType,
} from "@app/types";

export class MembershipFactory {
  static async associate(
    workspace: WorkspaceType,
    user: UserResource,
    {
      role,
      origin = "invited",
    }: {
      role: MembershipRoleType;
      origin?: MembershipOriginType;
    },
    t?: Transaction
  ) {
    return MembershipResource.createMembership({
      workspace,
      user,
      role,
      origin,
      transaction: t,
    });
  }
}
