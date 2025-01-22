import type { MembershipRoleType } from "@dust-tt/types";
import type { CreationOptional, ForeignKey } from "sequelize";
import { DataTypes } from "sequelize";

import { Workspace } from "@app/lib/models/workspace";
import { frontSequelize } from "@app/lib/resources/storage";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { BaseModel } from "@app/lib/resources/storage/wrappers/base";

export class MembershipModel extends BaseModel<MembershipModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare role: MembershipRoleType;
  declare startAt: Date;
  declare endAt: Date | null;

  declare userId: ForeignKey<UserModel["id"]>;
  declare workspaceId: ForeignKey<Workspace["id"]>;
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
    ],
  }
);
UserModel.hasMany(MembershipModel, {
  foreignKey: { allowNull: false },
  onDelete: "RESTRICT",
});
Workspace.hasMany(MembershipModel, {
  foreignKey: { allowNull: false },
  onDelete: "RESTRICT",
});
MembershipModel.belongsTo(Workspace);
MembershipModel.belongsTo(UserModel);
