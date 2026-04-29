import { frontSequelize } from "@app/lib/resources/storage";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { BaseModel } from "@app/lib/resources/storage/wrappers/base";
import type { CreationOptional, ForeignKey, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

export class CouponModel extends BaseModel<CouponModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare code: string;
  declare description: string | null;
  declare discountType: "fixed" | "usage_credit";
  declare creditTypeId: string;
  declare amountMicroUsd: number;
  declare durationMonths: number | null;
  declare maxRedemptions: number | null;
  declare redemptionCount: CreationOptional<number>;
  declare redeemBy: Date | null;
  declare archivedAt: Date | null;
  declare createdByUserId: ForeignKey<UserModel["id"]> | null;

  declare createdByUser: NonAttribute<UserModel>;
}

CouponModel.init(
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
    code: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: true,
    },
    description: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    discountType: {
      type: DataTypes.STRING(32),
      allowNull: false,
    },
    creditTypeId: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    amountMicroUsd: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    durationMonths: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null,
    },
    maxRedemptions: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null,
    },
    redemptionCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    redeemBy: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
    archivedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
  },
  {
    modelName: "coupon",
    sequelize: frontSequelize,
    indexes: [
      { fields: ["createdByUserId"], name: "coupons_created_by_user_idx" },
    ],
  }
);

CouponModel.belongsTo(UserModel, {
  as: "createdByUser",
  foreignKey: { name: "createdByUserId", allowNull: true },
});
