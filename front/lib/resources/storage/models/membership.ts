import type { MembershipRoleType } from "@dust-tt/types";
import type { CreationOptional, ForeignKey } from "sequelize";
import { DataTypes } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { ModelWithWorkspace } from "@app/lib/resources/storage/wrappers/model_with_workspace";

export class MembershipModel extends ModelWithWorkspace<MembershipModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare role: MembershipRoleType;
  declare startAt: Date;
  declare endAt: Date | null;

  declare userId: ForeignKey<UserModel["id"]>;
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
MembershipModel.belongsTo(UserModel);
