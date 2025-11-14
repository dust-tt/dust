import type { CreationOptional } from "sequelize";
import { DataTypes, Op } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";

/**
 * CreditModel stores consumable monetary credits for programmatic API usage.
 * Amounts are expressed in integer cents (USD).
 */
export class CreditModel extends WorkspaceAwareModel<CreditModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare expirationDate: Date | null;
  declare initialAmount: number; // in cents
  declare remainingAmount: number; // in cents
}

CreditModel.init(
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
    expirationDate: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
    initialAmount: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    remainingAmount: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  },
  {
    modelName: "credit",
    sequelize: frontSequelize,
    indexes: [
      { fields: ["workspaceId"] },
      { fields: ["workspaceId", "expirationDate"] },
      // Partial index equivalent: optimize lookups for credits with non-zero remainingAmount
      {
        fields: ["workspaceId", "expirationDate"],
        where: { remainingAmount: { [Op.ne]: 0 } },
        concurrently: true,
      },
    ],
  }
);
