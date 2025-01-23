import type { MembershipRoleType } from "@dust-tt/types";
import type { InferCreationAttributes } from "sequelize";

import type { Workspace } from "@app/lib/models/workspace";
import { MembershipModel } from "@app/lib/resources/storage/models/membership";
import type { UserModel } from "@app/lib/resources/storage/models/user";

import { Factory } from "./factories";

class MembershipFactory extends Factory<MembershipModel> {
  async make(params: InferCreationAttributes<MembershipModel>) {
    return MembershipModel.create(params);
  }

  associate(workspace: Workspace, user: UserModel, role: MembershipRoleType) {
    return this.params({
      role,
      startAt: new Date(),
      endAt: null,
      userId: user.id,
      workspaceId: workspace.id,
    });
  }
}

export const membershipFactory = () => {
  return new MembershipFactory();
};
