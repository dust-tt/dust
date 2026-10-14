import { frontSequelize } from "@app/lib/resources/storage";
import { DataTypes } from "@app/lib/resources/storage/data_types";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { PlanGatewayType } from "@app/types/plan";
import { PLAN_GATEWAYS } from "@app/types/plan";
import type { CreationOptional, ForeignKey } from "sequelize";
import { Op } from "sequelize";

// Pointer to an AI gateway key minted for a user, or for the workspace itself when `userId` is
// NULL (calls made without a user). The secret lives in the OAuth service under `credentialId`.
export class GatewayApiKeyModel extends WorkspaceAwareModel<GatewayApiKeyModel> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare gateway: PlanGatewayType;
  declare userId: ForeignKey<UserModel["id"]> | null;
  declare credentialId: string;
  // Id of the key on the gateway side, needed to revoke it.
  declare gatewayKeyId: string;
}

GatewayApiKeyModel.init(
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
    gateway: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        isIn: [PLAN_GATEWAYS],
      },
    },
    credentialId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    gatewayKeyId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    modelName: "gateway_api_key",
    sequelize: frontSequelize,
    indexes: [
      {
        name: "gateway_api_keys_workspace_gateway_user_idx",
        unique: true,
        fields: ["workspaceId", "gateway", "userId"],
        where: { userId: { [Op.ne]: null } },
      },
      {
        name: "gateway_api_keys_workspace_gateway_no_user_idx",
        unique: true,
        fields: ["workspaceId", "gateway"],
        where: { userId: null },
      },
      // Neither partial index above serves a bare workspaceId lookup (workspace scrub).
      { fields: ["workspaceId"] },
      // The user FK cascades on user deletion; index it so the cascade does not scan the table.
      { fields: ["userId"] },
    ],
  }
);

GatewayApiKeyModel.belongsTo(UserModel, {
  foreignKey: { name: "userId", allowNull: true },
  onDelete: "CASCADE",
});
