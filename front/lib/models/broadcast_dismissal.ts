import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { BaseModel } from "@app/lib/resources/storage/wrappers/base";

// Forward declaration - actual import will cause circular dependency
// BroadcastModel is imported and associated in broadcast.ts
export class BroadcastDismissalModel extends BaseModel<BroadcastDismissalModel> {
  declare createdAt: CreationOptional<Date>;
  declare dismissedAt: CreationOptional<Date>;

  declare id: CreationOptional<number>;
  declare broadcastId: ForeignKey<number>;
  declare userId: ForeignKey<number>;
  declare workspaceId: ForeignKey<number>;

  declare user: NonAttribute<UserModel>;
  declare workspace: NonAttribute<WorkspaceModel>;
}

BroadcastDismissalModel.init(
  {
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    dismissedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    broadcastId: {
      type: DataTypes.BIGINT,
      allowNull: false,
      references: {
        model: "broadcasts",
        key: "id",
      },
    },
    userId: {
      type: DataTypes.BIGINT,
      allowNull: false,
      references: {
        model: UserModel,
        key: "id",
      },
    },
    workspaceId: {
      type: DataTypes.BIGINT,
      allowNull: false,
      references: {
        model: WorkspaceModel,
        key: "id",
      },
    },
  },
  {
    modelName: "broadcast_dismissal",
    tableName: "broadcast_dismissals",
    sequelize: frontSequelize,
    indexes: [
      {
        unique: true,
        fields: ["broadcastId", "userId", "workspaceId"],
      },
    ],
  }
);

// Define associations
BroadcastDismissalModel.belongsTo(UserModel, {
  foreignKey: "userId",
  as: "user",
});

BroadcastDismissalModel.belongsTo(WorkspaceModel, {
  foreignKey: "workspaceId",
  as: "workspace",
});