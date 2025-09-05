import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

import { TriggerModel } from "@app/lib/models/assistant/triggers/triggers";
import { frontSequelize } from "@app/lib/resources/storage";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";

export class TriggerSubscriberModel extends WorkspaceAwareModel<TriggerSubscriberModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare triggerId: ForeignKey<TriggerModel["id"]>;
  declare userId: ForeignKey<UserModel["id"]>;

  declare trigger: NonAttribute<TriggerModel>;
  declare user: NonAttribute<UserModel>;
}

TriggerSubscriberModel.init(
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
    triggerId: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    userId: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
  },
  {
    modelName: "trigger_subscriber",
    sequelize: frontSequelize,
    indexes: [{ fields: ["workspaceId", "triggerId", "userId"], unique: true }],
  }
);

TriggerSubscriberModel.belongsTo(TriggerModel);

TriggerModel.hasMany(TriggerSubscriberModel, {
  foreignKey: { name: "triggerId", allowNull: false },
  onDelete: "RESTRICT",
});

TriggerSubscriberModel.belongsTo(UserModel);

UserModel.hasMany(TriggerSubscriberModel, {
  foreignKey: { name: "userId", allowNull: false },
  onDelete: "RESTRICT",
});
