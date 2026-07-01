import { frontSequelize } from "@app/lib/resources/storage";
import { DataTypes } from "@app/lib/resources/storage/data_types";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { ApiKeyCreditState } from "@app/types/key";
import type { ModelId } from "@app/types/shared/model_id";
import type { RoleType } from "@app/types/user";
import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";

export class KeyModel extends WorkspaceAwareModel<KeyModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare lastUsedAt: CreationOptional<Date | null>;

  declare secret: string;
  declare status: "active" | "disabled";
  declare isSystem: boolean;
  declare role: RoleType;

  declare userId: ForeignKey<UserModel["id"]>;

  declare groupIds: ModelId[];

  declare name: string;
  declare monthlyCapMicroUsd: number | null;
  // Admin-set cap on workspace-pool AWU consumption, in AWU credits. NULL means
  // no cap (unlimited). On credit-priced plans this is the enforcement source:
  // a Metronome `spend_threshold_reached` alert (group key `api_key_name`,
  // threshold = this value) drives `creditState`. Key names are NOT unique, and
  // Metronome aggregates spend by name — so the cap is effectively per-name:
  // all active keys sharing a name share the limit and are blocked together.
  declare monthlyCapAwuCredits: number | null;
  declare creditState: CreationOptional<ApiKeyCreditState>;
  declare user: NonAttribute<UserModel>;
}
KeyModel.init(
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
    lastUsedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    secret: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    isSystem: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    },
    role: {
      type: DataTypes.STRING,
      defaultValue: "builder",
      allowNull: false,
    },
    monthlyCapMicroUsd: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    monthlyCapAwuCredits: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    creditState: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "on_pool",
    },
    groupIds: {
      type: DataTypes.ARRAY(DataTypes.BIGINT),
      allowNull: false,
    },
  },
  {
    modelName: "keys",
    sequelize: frontSequelize,
    indexes: [
      { unique: true, fields: ["secret"] },
      { fields: ["userId"] },
      { fields: ["workspaceId"] },
      { fields: ["groupIds"] },
    ],
  }
);
// We don't want to delete keys when a user gets deleted.
UserModel.hasMany(KeyModel, {
  foreignKey: { allowNull: true },
  onDelete: "SET NULL",
});

KeyModel.belongsTo(UserModel);
