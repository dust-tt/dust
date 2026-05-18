import { frontSequelize } from "@app/lib/resources/storage";
import { CouponModel } from "@app/lib/resources/storage/models/coupons";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceAwareModel } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

export class CouponRedemptionModel extends WorkspaceAwareModel<CouponRedemptionModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare couponId: ForeignKey<CouponModel["id"]>;
  declare redeemedByUserId: ForeignKey<UserModel["id"]> | null;
  declare redeemedAt: CreationOptional<Date>;
  declare metronomeCreditIds: string[];
  declare status: "pending" | "failed" | "active" | "revoked";

  declare coupon: NonAttribute<CouponModel>;
  declare redeemedByUser: NonAttribute<UserModel>;
}

CouponRedemptionModel.init(
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
    redeemedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    metronomeCreditIds: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: false,
      defaultValue: [],
    },
    status: {
      type: DataTypes.STRING(16),
      allowNull: false,
      defaultValue: "pending",
    },
  },
  {
    modelName: "coupon_redemption",
    sequelize: frontSequelize,
    indexes: [
      { fields: ["workspaceId"], name: "coupon_redemptions_workspace_idx" },
      { fields: ["couponId"], name: "coupon_redemptions_coupon_idx" },
      {
        fields: ["redeemedByUserId"],
        name: "coupon_redemptions_redeemed_by_user_idx",
      },
      {
        fields: ["couponId", "workspaceId"],
        unique: true,
        where: { status: ["pending", "active"] },
        name: "coupon_redemptions_coupon_workspace_active_idx",
      },
    ],
  }
);

CouponRedemptionModel.belongsTo(CouponModel, {
  as: "coupon",
  foreignKey: { name: "couponId", allowNull: false },
});

CouponModel.hasMany(CouponRedemptionModel, {
  foreignKey: { name: "couponId", allowNull: false },
});

CouponRedemptionModel.belongsTo(UserModel, {
  as: "redeemedByUser",
  foreignKey: { name: "redeemedByUserId", allowNull: true },
});
