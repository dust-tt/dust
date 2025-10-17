import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { MembershipOriginType, MembershipRoleType } from "@app/types";

export class MembershipModel extends WorkspaceAwareModel<MembershipModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare role: MembershipRoleType;
  declare origin: MembershipOriginType;
  declare startAt: Date;
  declare endAt: Date | null;

  declare userId: ForeignKey<UserModel["id"]>;
  declare user: NonAttribute<UserModel>;
}
MembershipModel.init(
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
    role: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    origin: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "invited",
    },
    startAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    endAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    modelName: "membership",
    sequelize: frontSequelize,
    indexes: [
      { fields: ["userId", "role"] },
      { fields: ["startAt"] },
      { fields: ["endAt"] },
      { fields: ["workspaceId", "userId", "startAt", "endAt"] },
      { fields: ["userId"] },
    ],
  }
);
UserModel.hasMany(MembershipModel, {
  foreignKey: { allowNull: false },
  onDelete: "RESTRICT",
});

MembershipModel.belongsTo(UserModel);
