import type { Transaction } from "sequelize";

import type { GroupResource } from "@app/lib/resources/group_resource";
import { GroupMembershipModel } from "@app/lib/resources/storage/models/group_memberships";
import type { UserResource } from "@app/lib/resources/user_resource";
import type { WorkspaceType } from "@app/types";

export class GroupMembershipFactory {
  static async associate(
    workspace: WorkspaceType,
    group: GroupResource,
    user: UserResource,
    t?: Transaction
  ) {
    return GroupMembershipModel.create(
      {
        groupId: group.id,
        userId: user.id,
        workspaceId: workspace.id,
        startAt: new Date(),
      },
      { transaction: t }
    );
  }
}
