import type { CreationOptional, NonAttribute } from "sequelize";
import { DataTypes } from "sequelize";

import { BroadcastDismissalModel } from "@app/lib/models/broadcast_dismissal";
import { frontSequelize } from "@app/lib/resources/storage";
import { BaseModel } from "@app/lib/resources/storage/wrappers/base";
import type { PlanType } from "@app/types/plan";

export type BroadcastTargetingType = "all" | "users" | "workspaces" | "plans";
export type BroadcastMediaType = "image" | "gif" | "video";
export type BroadcastStatus = "draft" | "scheduled" | "published" | "expired";

export interface BroadcastTargetingData {
  userIds?: string[];
  workspaceIds?: string[];
  planCodes?: string[];
}

export class BroadcastModel extends BaseModel<BroadcastModel> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare id: CreationOptional<number>;
  declare sId: string;
  declare title: string;
  declare shortDescription: string;
  declare longDescription: string | null;
  declare mediaUrl: string | null;
  declare mediaType: BroadcastMediaType | null;
  declare publishToChangelog: boolean;
  declare shouldBroadcast: boolean;
  declare targetingType: BroadcastTargetingType;
  declare targetingData: BroadcastTargetingData | null;
  declare startDate: Date;
  declare endDate: Date | null;
  declare priority: number;
  declare status: BroadcastStatus;
  declare publishedAt: Date | null;

  declare dismissals: NonAttribute<BroadcastDismissalModel[]>;

  /**
   * Check if this broadcast should be shown to a specific user/workspace/plan
   */
  shouldShowTo(
    userId: string | null,
    workspaceId: string | null,
    plan: PlanType | null
  ): boolean {
    // Check if broadcast is active
    const now = new Date();
    if (this.status !== "published") {
      return false;
    }
    if (this.startDate > now) {
      return false;
    }
    if (this.endDate && this.endDate < now) {
      return false;
    }
    if (!this.shouldBroadcast) {
      return false;
    }

    // Check targeting rules
    if (this.targetingType === "all") {
      return true;
    }

    if (!this.targetingData) {
      return false;
    }

    if (this.targetingType === "users" && userId) {
      return this.targetingData.userIds?.includes(userId) || false;
    }

    if (this.targetingType === "workspaces" && workspaceId) {
      return this.targetingData.workspaceIds?.includes(workspaceId) || false;
    }

    if (this.targetingType === "plans" && plan) {
      return this.targetingData.planCodes?.includes(plan.code) || false;
    }

    return false;
  }
}

BroadcastModel.init(
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
    sId: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    shortDescription: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    longDescription: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    mediaUrl: {
      type: DataTypes.STRING(1024),
      allowNull: true,
    },
    mediaType: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        isIn: [["image", "gif", "video"]],
      },
    },
    publishToChangelog: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    shouldBroadcast: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    targetingType: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "all",
      validate: {
        isIn: [["all", "users", "workspaces", "plans"]],
      },
    },
    targetingData: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    startDate: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    endDate: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    priority: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "draft",
      validate: {
        isIn: [["draft", "scheduled", "published", "expired"]],
      },
    },
    publishedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    modelName: "broadcast",
    tableName: "broadcasts",
    sequelize: frontSequelize,
    indexes: [
      {
        fields: ["status", "startDate", "endDate"],
        where: { status: "published" },
        name: "idx_broadcasts_active",
      },
      {
        fields: ["publishToChangelog", "publishedAt"],
        where: { publishToChangelog: true, status: "published" },
        name: "idx_broadcasts_changelog",
      },
    ],
  }
);

// Define associations after both models are initialized
BroadcastModel.hasMany(BroadcastDismissalModel, {
  foreignKey: "broadcastId",
  as: "dismissals",
  onDelete: "CASCADE",
});