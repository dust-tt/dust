import { MembershipResource } from "@app/lib/resources/membership_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import type {
  MembershipOriginType,
  MembershipRoleType,
  MembershipSeatType,
} from "@app/types/memberships";
import type { WorkspaceType } from "@app/types/user";
import type { Transaction } from "sequelize";

export class MembershipFactory {
  static async associate(
    workspace: WorkspaceType,
    user: UserResource,
    {
      role,
      origin = "invited",
      seatType,
    }: {
      role: MembershipRoleType;
      origin?: MembershipOriginType;
      seatType?: MembershipSeatType;
    },
    t?: Transaction
  ) {
    return MembershipResource.createMembership({
      workspace,
      user,
      role,
      origin,
      seatType,
      transaction: t,
    });
  }
}
