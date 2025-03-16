import type { CreationOptional, ForeignKey } from "sequelize";
import { DataTypes } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { RoleType } from "@app/types";

export class MembershipInvitation extends WorkspaceAwareModel<MembershipInvitation> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare sId: string;
  declare inviteEmail: string;
  declare status: "pending" | "consumed" | "revoked";
  declare initialRole: Exclude<RoleType, "none">;

  declare invitedUserId: ForeignKey<UserModel["id"]> | null;
}
MembershipInvitation.init(
  {
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    sId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    inviteEmail: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "pending",
    },
    initialRole: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "user",
    },
  },
  {
    modelName: "membership_invitation",
    sequelize: frontSequelize,
    indexes: [
      { fields: ["workspaceId", "status"] },
      { unique: true, fields: ["sId"] },
      { fields: ["inviteEmail", "status"] },
    ],
  }
);

UserModel.hasMany(MembershipInvitation, {
  foreignKey: "invitedUserId",
});
